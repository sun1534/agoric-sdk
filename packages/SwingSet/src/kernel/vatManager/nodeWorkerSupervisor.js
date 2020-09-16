/* global harden */
// this file is loaded at the start of a new Worker, which makes it a new JS
// environment (with it's own Realm), so we must install-ses too.
import '@agoric/install-ses';
import { parentPort } from 'worker_threads';
import anylogger from 'anylogger';

import { assert } from '@agoric/assert';
import { importBundle } from '@agoric/import-bundle';
import { Remotable, getInterfaceOf, makeMarshal } from '@agoric/marshal';
import { waitUntilQuiescent } from '../../waitUntilQuiescent';
import { makeLiveSlots } from '../liveSlots';

// eslint-disable-next-line no-unused-vars
function workerLog(first, ...args) {
  // console.error(`---worker: ${first}`, ...args);
}

workerLog(`supervisor started`);

function makeConsole(tag) {
  const log = anylogger(tag);
  const cons = {};
  for (const level of ['debug', 'log', 'info', 'warn', 'error']) {
    cons[level] = log[level];
  }
  return harden(cons);
}

function runAndWait(f, errmsg) {
  Promise.resolve()
    .then(f)
    .then(undefined, err => workerLog(`doProcess: ${errmsg}:`, err));
  return waitUntilQuiescent();
}

function sendUplink(msg) {
  assert(msg instanceof Array, `msg must be an Array`);
  parentPort.postMessage(msg);
}

let dispatch;

async function doProcess(dispatchRecord, errmsg) {
  const dispatchOp = dispatchRecord[0];
  const dispatchArgs = dispatchRecord.slice(1);
  workerLog(`runAndWait`);
  await runAndWait(() => dispatch[dispatchOp](...dispatchArgs), errmsg);
  workerLog(`doProcess done`);
}

function doNotify(vpid, vp) {
  const errmsg = `vat.promise[${vpid}] ${vp.state} failed`;
  switch (vp.state) {
    case 'fulfilledToPresence':
      return doProcess(['notifyFulfillToPresence', vpid, vp.slot], errmsg);
    case 'redirected':
      // TODO unimplemented
      throw new Error('not implemented yet');
    case 'fulfilledToData':
      return doProcess(['notifyFulfillToData', vpid, vp.data], errmsg);
    case 'rejected':
      return doProcess(['notifyReject', vpid, vp.data], errmsg);
    default:
      throw Error(`unknown promise state '${vp.state}'`);
  }
}

let syscallLog;
parentPort.on('message', ([type, ...margs]) => {
  workerLog(`received`, type);
  if (type === 'start') {
    // TODO: parent should send ['start', vatID]
    workerLog(`got start`);
    sendUplink(['gotStart']);
  } else if (type === 'setBundle') {
    const [bundle, vatParameters] = margs;
    const endowments = {
      console: makeConsole(`SwingSet:vatWorker`),
    };
    importBundle(bundle, { endowments }).then(vatNS => {
      workerLog(`got vatNS:`, Object.keys(vatNS).join(','));
      sendUplink(['gotBundle']);

      function doSyscall(vatSyscallObject) {
        sendUplink(['syscall', ...vatSyscallObject]);
      }
      const syscall = harden({
        send: (...args) => doSyscall(['send', ...args]),
        callNow: (..._args) => {
          throw Error(`nodeWorker cannot syscall.callNow`);
        },
        subscribe: (...args) => doSyscall(['subscribe', ...args]),
        fulfillToData: (...args) => doSyscall(['fulfillToData', ...args]),
        fulfillToPresence: (...args) =>
          doSyscall(['fulfillToPresence', ...args]),
        reject: (...args) => doSyscall(['reject', ...args]),
      });

      const state = null;
      const vatID = 'demo-vatID';
      // todo: maybe add transformTildot, makeGetMeter/transformMetering to
      // vatPowers, but only if options tell us they're wanted. Maybe
      // transformTildot should be async and outsourced to the kernel
      // process/thread.
      const vatPowers = { Remotable, getInterfaceOf, makeMarshal };
      dispatch = makeLiveSlots(
        syscall,
        state,
        vatNS.buildRootObject,
        vatID,
        vatPowers,
        vatParameters,
      );
      workerLog(`got dispatch:`, Object.keys(dispatch).join(','));
      sendUplink(['dispatchReady']);
    });
  } else if (type === 'deliver') {
    if (!dispatch) {
      workerLog(`error: deliver before dispatchReady`);
      return;
    }
    const [dtype, ...dargs] = margs;
    if (dtype === 'message') {
      const [targetSlot, msg] = dargs;
      const errmsg = `vat[${targetSlot}].${msg.method} dispatch failed`;
      doProcess(
        ['deliver', targetSlot, msg.method, msg.args, msg.result],
        errmsg,
      ).then(() => {
        sendUplink(['deliverDone']);
      });
    } else if (dtype === 'notify') {
      doNotify(...dargs).then(() => sendUplink(['deliverDone', syscallLog]));
    } else {
      throw Error(`bad delivery type ${dtype}`);
    }
  } else {
    workerLog(`unrecognized downlink message ${type}`);
  }
});

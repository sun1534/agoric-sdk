const testLogs = {
  'left does: E(right.0).method() => returnData': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> right.method was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
  ],
  'left does: E(right.0).method(dataArg1) => returnData': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodWithArgs","args":["hello"],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> right.methodWithArgs got the arg: hello',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"hello was received\\"","slots":[]}',
    '=> left vat receives the returnedData: hello was received',
  ],
  'left does: E(right.0).method(right.0) => returnData': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodWithPresence","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-egress","id":0}],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> right.methodWithPresence got the ref [object Object]',
    '=> right.method was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
  ],
  'left does: E(right.0).method(left.1) => returnData': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodWithPresence","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-ingress","id":2}],"resultSlot":{"type":"your-resolver","id":3}}',
    '=> right.methodWithPresence got the ref [object Object]',
    'sendOverChannel from right, to: left message: {"target":{"type":"your-egress","id":2},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> left.1.method was invoked',
    'sendOverChannel from left, to: right: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"called method\\"","slots":[]}',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":3},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
  ],

  'left does: E(right.0).method(left.1) => returnData twice': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodWithPresenceTwice","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-ingress","id":2}],"resultSlot":{"type":"your-resolver","id":3}}',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodWithPresenceTwice","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-ingress","id":2}],"resultSlot":{"type":"your-resolver","id":4}}',
    '=> right.methodWithPresence got the ref [object Object]',
    'ref equal each time: true',
    '=> right.methodWithPresence got the ref [object Object]',
    'sendOverChannel from right, to: left message: {"target":{"type":"your-egress","id":2},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    'sendOverChannel from right, to: left message: {"target":{"type":"your-egress","id":2},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":3}}',
    '=> left.1.method was invoked',
    '=> left.1.method was invoked',
    'sendOverChannel from left, to: right: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"called method\\"","slots":[]}',
    'sendOverChannel from left, to: right: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":3},"args":"\\"called method\\"","slots":[]}',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":3},"args":"\\"called method\\"","slots":[]}',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":4},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
    '=> left vat receives the returnedData: called method',
  ],

  'left does: E(right.1).method() => returnData': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"createNewObj","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    'sendOverChannel message: {"event":"notifyFulfillToTarget","promise":{"type":"your-promise","id":2},"target":{"type":"your-ingress","id":1}}',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":1},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":4}}',
    '=> right.1.method was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":4},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
  ],
  'left does: E(right.0).method() => right.presence': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsRightPresence","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    'sendOverChannel message: {"event":"notifyFulfillToTarget","promise":{"type":"your-promise","id":2},"target":{"type":"your-ingress","id":1}}',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":1},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":4}}',
    '=> right.1.method was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":4},"args":"\\"called method\\"","slots":[]}',
    '=> left vat receives the returnedData: called method',
  ],
  'left does: E(right.0).method() => left.presence': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsLeftPresence","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-ingress","id":2}],"resultSlot":{"type":"your-resolver","id":3}}',
    'sendOverChannel message: {"event":"notifyFulfillToTarget","promise":{"type":"your-promise","id":3},"target":{"type":"your-egress","id":2}}',
    '=> left.1.method was invoked',
    '=> left vat receives the returnedData: called method',
  ],
  'left does: E(right.0).method() => right.promise => data': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    '=> left vat receives the returnedPromise: [object Promise]',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsPromise","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> right.methodReturnsPromise was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":2},"args":"\\"foo\\"","slots":[]}',
    '=> returnedPromise.then: foo',
  ],
  'left does: E(right.0).method() => right.promise => right.presence': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    '=> left vat receives the returnedPromise: [object Promise]',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsPromiseForRightPresence","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    'sendOverChannel message: {"event":"notifyFulfillToTarget","promise":{"type":"your-promise","id":2},"target":{"type":"your-ingress","id":1}}',
    '=> returnedPromise.then: [object Object]',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":1},"methodName":"method","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":4}}',
    '=> right.1.method was invoked',
    'sendOverChannel from right, to: left: {"event":"notifyFulfillToData","promise":{"type":"your-promise","id":4},"args":"\\"called method\\"","slots":[]}',
    '=> presence methodCallResult: called method',
  ],

  'left does: E(right.0).method() => right.promise => left.presence': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    '=> left vat receives the returnedPromise: [object Promise]',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsPromiseForLeftPresence","args":[{"@qclass":"slot","index":0}],"slots":[{"type":"your-ingress","id":2}],"resultSlot":{"type":"your-resolver","id":3}}',
    'sendOverChannel message: {"event":"notifyFulfillToTarget","promise":{"type":"your-promise","id":3},"target":{"type":"your-egress","id":2}}',
    '=> returnedPromise.then: [object Object]',
    '=> left.1.method was invoked',
    '=> presence methodCallResult: called method',
  ],
  'left does: E(right.0).method() => right.promise => reject': [
    '=> setup called',
    '=> bootstrap() called',
    'init called with name right',
    'init called with name left',
    'connect called with otherMachineName left, channelName channel',
    'connect called with otherMachineName right, channelName channel',
    'addEgress called with sender left, index 0, valslot [object Object]',
    'addIngress called with machineName right, index 0',
    '=> left vat receives the returnedPromise: [object Promise]',
    'sendOverChannel from left, to: right message: {"target":{"type":"your-egress","id":0},"methodName":"methodReturnsPromiseReject","args":[],"slots":[],"resultSlot":{"type":"your-resolver","id":2}}',
    '=> right.methodReturnsPromiseReject was invoked',
    'sendOverChannel notifyReject promiseID: 20, data: {"@qclass":"error","name":"Error","message":"this was rejected"}',
  ],
};

export default testLogs;

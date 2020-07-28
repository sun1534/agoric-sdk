/**
 * Create an installation by permanently storing the bundle. It will be
 * evaluated each time it is used to make a new instance of a contract.
 */
export const makeInstallFn = addInstallation => {
  const install = async bundle => {
    const installation = harden({ getBundle: () => bundle });
    addInstallation(installation);
    return installation;
  };
  return install;
};

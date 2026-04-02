export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleQuantClawDevices: MatrixManagedDeviceInfo[];
  currentQuantClawDevices: MatrixManagedDeviceInfo[];
};

const OPENCLAW_DEVICE_NAME_PREFIX = "QuantClaw ";

export function isQuantClawManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(OPENCLAW_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isQuantClawManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleQuantClawDevices: openClawDevices.filter((device) => !device.current),
    currentQuantClawDevices: openClawDevices.filter((device) => device.current),
  };
}

import { FileScanService } from "./file-scan.service";

describe("FileScanService", () => {
  function serviceWithEnv(env: Record<string, string | undefined>) {
    return new FileScanService({
      get: jest.fn((key: string) => env[key])
    } as never);
  }

  it("uses a ClamAV socket path when configured", () => {
    const service = serviceWithEnv({ CLAMAV_SOCKET_PATH: "/var/run/clamav/clamd.ctl" });

    expect((service as unknown as { clamdConnectionOptions: () => unknown }).clamdConnectionOptions()).toEqual({
      path: "/var/run/clamav/clamd.ctl"
    });
  });

  it("falls back to ClamAV host and port", () => {
    const service = serviceWithEnv({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "3310" });

    expect((service as unknown as { clamdConnectionOptions: () => unknown }).clamdConnectionOptions()).toEqual({
      host: "127.0.0.1",
      port: 3310
    });
  });
});

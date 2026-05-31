import { ForbiddenException } from "@nestjs/common";
import { PermissionsGuard } from "./permissions.guard";

describe("PermissionsGuard", () => {
  function createContext(permissions: string[]) {
    return {
      getHandler: () => "handler",
      getClass: () => "class",
      switchToHttp: () => ({
        getRequest: () => ({ user: { permissions } })
      })
    };
  }

  it("allows users with all required permissions", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["tickets.view", "tickets.reply"])
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(guard.canActivate(createContext(["tickets.view", "tickets.reply"]) as never)).toBe(true);
  });

  it("blocks users missing a required permission", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["tickets.delete"])
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(() => guard.canActivate(createContext(["tickets.view"]) as never)).toThrow(ForbiddenException);
  });
});

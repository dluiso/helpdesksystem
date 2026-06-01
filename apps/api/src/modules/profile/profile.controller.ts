import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileSignatureDto } from "./dto/update-profile-signature.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileDto) {
    return this.profileService.updateProfile(user, input);
  }

  @Patch("password")
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangePasswordDto) {
    return this.profileService.changePassword(user, input);
  }

  @Get("signature")
  signature(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.signature(user);
  }

  @Patch("signature")
  updateSignature(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileSignatureDto) {
    return this.profileService.updateSignature(user, input);
  }
}

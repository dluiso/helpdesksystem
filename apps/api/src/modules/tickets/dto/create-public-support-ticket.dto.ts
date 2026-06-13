import { TicketPriority } from "@prisma/client";
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePublicSupportTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  requesterName!: string;

  @IsEmail()
  @MaxLength(255)
  requesterEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requesterPhone?: string | null;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  description!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  captchaToken?: string | null;
}

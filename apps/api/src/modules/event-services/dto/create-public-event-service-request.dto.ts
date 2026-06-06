import { IsArray, IsEmail, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreatePublicEventServiceRequestDto {
  @IsString()
  @MaxLength(180)
  eventName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  organizer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  venue?: string;

  @IsOptional()
  @IsISO8601()
  eventDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  serviceIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalInfo?: string;

  @IsString()
  @MaxLength(120)
  requesterFirstName!: string;

  @IsString()
  @MaxLength(120)
  requesterLastName!: string;

  @IsEmail()
  requesterEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requesterPhone?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}

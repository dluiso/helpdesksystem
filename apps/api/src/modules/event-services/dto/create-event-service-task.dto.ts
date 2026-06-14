import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateEventServiceTaskDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dueAt?: string | null;

}

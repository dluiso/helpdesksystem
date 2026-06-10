import { IsString, MaxLength } from "class-validator";

export class CreateEventServiceMessageDto {
  @IsString()
  @MaxLength(8000)
  body!: string;
}

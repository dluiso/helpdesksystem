import { IsString, MaxLength } from "class-validator";

export class CreateEventServiceCommentDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}

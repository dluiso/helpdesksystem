import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateDashboardPreferencesDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  layout: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  hiddenWidgets?: string[];
}

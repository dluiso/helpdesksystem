import { Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, ValidateNested, Min } from "class-validator";

class ReorderSupportPortalSectionItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

class ReorderSupportPortalFieldItemDto {
  @IsString()
  id!: string;

  @IsString()
  sectionId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderSupportPortalSectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderSupportPortalSectionItemDto)
  sections!: ReorderSupportPortalSectionItemDto[];
}

export class ReorderSupportPortalFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderSupportPortalFieldItemDto)
  fields!: ReorderSupportPortalFieldItemDto[];

  @IsOptional()
  @IsString()
  movedFieldId?: string;
}

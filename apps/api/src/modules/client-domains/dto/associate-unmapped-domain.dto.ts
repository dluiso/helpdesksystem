import { IsUUID } from "class-validator";

export class AssociateUnmappedDomainDto {
  @IsUUID()
  clientId: string;
}

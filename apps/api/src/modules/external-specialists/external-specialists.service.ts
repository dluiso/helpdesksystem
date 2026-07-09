import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertExternalSpecialistDto } from "./dto/upsert-external-specialist.dto";

@Injectable()
export class ExternalSpecialistsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.externalSpecialist.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
  }

  async create(user: AuthenticatedUser, input: UpsertExternalSpecialistDto) {
    const data = this.toData(input);
    try {
      return await this.prisma.externalSpecialist.create({
        data: {
          ...data,
          organizationId: user.organizationId
        }
      });
    } catch (error) {
      if (this.isUniqueEmailError(error)) {
        throw new BadRequestException("An external specialist with this email already exists.");
      }
      throw error;
    }
  }

  async update(id: string, user: AuthenticatedUser, input: UpsertExternalSpecialistDto) {
    await this.ensure(id, user.organizationId);
    const data = this.toData(input);
    try {
      return await this.prisma.externalSpecialist.update({
        where: { id },
        data
      });
    } catch (error) {
      if (this.isUniqueEmailError(error)) {
        throw new BadRequestException("An external specialist with this email already exists.");
      }
      throw error;
    }
  }

  async archive(id: string, user: AuthenticatedUser) {
    await this.ensure(id, user.organizationId);
    return this.prisma.externalSpecialist.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() }
    });
  }

  async ensure(id: string, organizationId: string) {
    const specialist = await this.prisma.externalSpecialist.findFirst({
      where: { id, organizationId, deletedAt: null }
    });
    if (!specialist) {
      throw new NotFoundException("External specialist was not found.");
    }
    return specialist;
  }

  private toData(input: UpsertExternalSpecialistDto) {
    return {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: this.optionalTrim(input.phone),
      company: this.optionalTrim(input.company),
      notes: this.optionalTrim(input.notes),
      isActive: input.isActive ?? true
    };
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private isUniqueEmailError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}

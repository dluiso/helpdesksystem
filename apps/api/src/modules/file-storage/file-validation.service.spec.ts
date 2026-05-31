import { BadRequestException } from "@nestjs/common";
import { FileValidationService } from "./file-validation.service";

describe("FileValidationService", () => {
  const settings = {
    getAttachmentPolicy: jest.fn().mockResolvedValue({
      maximumUploadSizeMb: 1,
      allowedAttachmentFileTypes: [],
      blockedAttachmentFileTypes: []
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks dangerous attachment extensions", async () => {
    const service = new FileValidationService(settings as never);

    await expect(
      service.validateAttachment({
        originalFilename: "payload.ps1",
        mimeType: "text/plain",
        sizeBytes: 128
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows initial safe preview types", () => {
    const service = new FileValidationService(settings as never);
    expect(service.canPreview("application/pdf")).toBe(true);
    expect(service.canPreview("text/html")).toBe(false);
  });
});

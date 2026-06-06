import { KnowledgeStatus, KnowledgeVisibility } from "@prisma/client";
import { KnowledgeBaseService } from "./knowledge-base.service";

const user = {
  id: "user-1",
  organizationId: "org-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  forcePasswordChange: false,
  permissions: []
};

describe("KnowledgeBaseService", () => {
  it("creates draft internal articles with sanitized content and normalized tags", async () => {
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      knowledgeArticle: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data, include }) => Promise.resolve({ id: "article-1", ...data, include }))
      }
    };
    const sanitizer = {
      sanitize: jest.fn().mockReturnValue("<p>Clean content</p>")
    };
    const service = new KnowledgeBaseService(prisma as never, sanitizer as never, {} as never);

    await service.createArticle(user, {
      title: "  Router Reset  ",
      content: "<script>alert(1)</script><p>Clean content</p>",
      tags: [" Network ", "network", "Troubleshooting"],
      status: KnowledgeStatus.DRAFT,
      visibility: KnowledgeVisibility.INTERNAL
    });

    expect(prisma.knowledgeArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          title: "Router Reset",
          slug: "router-reset",
          content: "<p>Clean content</p>",
          tags: ["network", "troubleshooting"],
          status: KnowledgeStatus.DRAFT,
          visibility: KnowledgeVisibility.INTERNAL,
          createdById: "user-1",
          updatedById: "user-1",
          publishedAt: null
        })
      })
    );
  });
});

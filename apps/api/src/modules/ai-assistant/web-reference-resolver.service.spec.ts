import { WebReferenceResolverService, extractWebUrls, isAllowedUrl, isPrivateAddress, unwrapSafeLink } from "./web-reference-resolver.service";

describe("WebReferenceResolverService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("extracts direct URLs and unwraps Microsoft Safe Links", () => {
    const target = "https://www.example.com/services/audio";
    const safeLink = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(target)}&data=test`;
    const [url] = extractWebUrls(`Please update ${safeLink}.`);

    expect(unwrapSafeLink(url).toString()).toBe(target);
  });

  it("only allows exact client domains and their subdomains", () => {
    expect(isAllowedUrl(new URL("https://www.example.com/page"), ["example.com"])).toBe(true);
    expect(isAllowedUrl(new URL("https://example.com.evil.test/page"), ["example.com"])).toBe(false);
    expect(isAllowedUrl(new URL("ftp://example.com/page"), ["example.com"])).toBe(false);
  });

  it("rejects private, loopback, link-local, and mapped addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.1.2")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.10")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("stores a bounded relevant excerpt for an approved public page", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(
      "<html><head><title>Community Services</title></head><body><script>ignore me</script><p>Parking pass instructions are available from the recreation office.</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } }
    ));
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update the parking pass instructions at https://93.184.216.34/services.",
      allowedDomains: ["93.184.216.34"]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: "FOUND", title: "Community Services", source: "EXPLICIT_URL" });
    expect(result[0].excerpt).toContain("Parking pass instructions");
    expect(result[0].excerpt).not.toContain("ignore me");
  });

  it("keeps prompt reference IDs aligned with the persisted list", () => {
    const service = new WebReferenceResolverService();
    const prompt = service.formatForPrompt([
      { url: "https://blocked.test/", title: null, excerpt: null, matchedTerms: [], source: "EXPLICIT_URL", status: "BLOCKED", checkedAt: "2026-07-22T00:00:00.000Z", confidence: 0, reason: "Blocked" },
      { url: "https://example.com/page", title: "Page", excerpt: "Relevant copy", matchedTerms: ["copy"], source: "EXPLICIT_URL", status: "FOUND", checkedAt: "2026-07-22T00:00:00.000Z", confidence: 0.8, reason: null }
    ]);

    expect(prompt).toContain("[WEB-2] Page");
    expect(prompt).not.toContain("blocked.test");
  });

  it("records blocked references without requesting them", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update https://127.0.0.1/admin.",
      allowedDomains: ["127.0.0.1"]
    });

    expect(result[0]).toMatchObject({ status: "BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

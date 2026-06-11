"use client";

import { Archive, ArrowLeft, Bold, BookOpen, Edit3, Eye, FileUp, Grid3X3, ImagePlus, Italic, List, ListOrdered, Plus, Save, Search, Table2, Trash2, Underline, UploadCloud, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiBaseUrl, apiFetch } from "@/lib/api";

type KnowledgeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type KnowledgeViewMode = "list" | "cards";

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface KnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count?: { articles: number };
}

interface KnowledgeAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  isInline: boolean;
}

interface KnowledgeArticlePage {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  sourceType?: string | null;
  sourceExternalId?: string | null;
  sourceUrl?: string | null;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  accentColor: string | null;
  tags: string[];
  status: KnowledgeStatus;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  categoryId: string | null;
  category: KnowledgeCategory | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  attachments: KnowledgeAttachment[];
  pages: KnowledgeArticlePage[];
}

interface KnowledgeSearchResult {
  articleId: string;
  articleTitle: string;
  articleStatus: KnowledgeStatus;
  categoryName: string | null;
  pageId: string | null;
  pageTitle: string | null;
  matchType: "article" | "page" | "tag";
  snippet: string;
  updatedAt: string;
}

interface ImportPage {
  title: string;
  content: string;
  sortOrder?: number;
  sourceType?: string | null;
  sourceExternalId?: string | null;
  sourceUrl?: string | null;
  selected?: boolean;
}

interface ImportItem {
  temporaryId: string;
  selected: boolean;
  title: string;
  content: string;
  accentColor?: string | null;
  categoryName: string | null;
  categoryId?: string | null;
  tags: string[];
  status: KnowledgeStatus;
  sensitiveWarnings: string[];
  pages?: ImportPage[];
  sourceType?: string | null;
  sourceExternalId?: string | null;
  sourceUrl?: string | null;
  alreadyImported?: boolean;
}

interface OneNoteStatus {
  enabled: boolean;
  configured: boolean;
  defaultCategoryId: string | null;
}

interface OneNoteNotebook {
  id: string;
  displayName: string;
  isDefault?: boolean;
  isShared?: boolean;
  userRole?: string;
}

interface OneNoteSection {
  id: string;
  displayName: string;
}

const accentPalette = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be123c", "#475569"];

const editorCommands = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
  { command: "insertUnorderedList", label: "Bullet list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered }
];

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function newPage(title = "Content", content = "<p></p>"): KnowledgeArticlePage {
  return {
    id: `draft-${crypto.randomUUID()}`,
    title,
    content,
    sortOrder: 0
  };
}

function emptyDraft(): Partial<KnowledgeArticle> {
  return {
    title: "",
    content: "<p></p>",
    accentColor: accentPalette[0],
    tags: [],
    status: "DRAFT",
    visibility: "INTERNAL",
    categoryId: null,
    pages: [newPage()]
  };
}

interface KnowledgeBaseWorkspaceProps {
  articleId?: string;
}

export function KnowledgeBaseWorkspace({ articleId }: KnowledgeBaseWorkspaceProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [detailArticle, setDetailArticle] = useState<KnowledgeArticle | null>(null);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [draft, setDraft] = useState<Partial<KnowledgeArticle>>(emptyDraft());
  const [editing, setEditing] = useState(false);
  const [activeDraftPageId, setActiveDraftPageId] = useState("");
  const [activeViewPageId, setActiveViewPageId] = useState("");
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>("cards");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [showImportReview, setShowImportReview] = useState(false);
  const [importSource, setImportSource] = useState<"PDF" | "OneNote">("PDF");
  const [oneNoteStatus, setOneNoteStatus] = useState<OneNoteStatus>({ enabled: false, configured: false, defaultCategoryId: null });
  const [showOneNoteImport, setShowOneNoteImport] = useState(false);
  const [oneNoteNotebooks, setOneNoteNotebooks] = useState<OneNoteNotebook[]>([]);
  const [oneNoteSections, setOneNoteSections] = useState<OneNoteSection[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [oneNoteCategoryId, setOneNoteCategoryId] = useState("");
  const [oneNoteImportError, setOneNoteImportError] = useState<string | null>(null);
  const [oneNoteImportProgress, setOneNoteImportProgress] = useState<string | null>(null);

  const isDetailMode = Boolean(articleId);
  const selectedArticle = isDetailMode ? detailArticle : articles.find((article) => article.id === selectedArticleId) ?? null;
  const selectedArticlePages = selectedArticle?.pages?.length ? selectedArticle.pages : selectedArticle ? [legacyPage(selectedArticle)] : [];
  const activeViewPage = selectedArticlePages.find((page) => page.id === activeViewPageId) ?? selectedArticlePages[0] ?? null;
  const draftPages = draft.pages?.length ? draft.pages : [newPage(draft.title || "Content", draft.content ?? "<p></p>")];
  const activeDraftPage = draftPages.find((page) => page.id === activeDraftPageId) ?? draftPages[0];
  const allTags = useMemo(() => [...new Set(articles.flatMap((article) => article.tags))].sort(), [articles]);
  const visibleAttachments = selectedArticle?.attachments.filter((attachment) => !attachment.isInline) ?? [];

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, search, categoryId, status, tag]);

  useEffect(() => {
    void loadOneNoteStatus();
  }, []);

  useEffect(() => {
    if (isDetailMode) return;
    const articleId = searchParams.get("articleId");
    if (articleId) setSelectedArticleId(articleId);
  }, [isDetailMode, searchParams]);

  useEffect(() => {
    if (selectedArticle && !editing) {
      setDraft(selectedArticle);
      setActiveViewPageId(searchParams.get("page") ?? selectedArticle.pages?.[0]?.id ?? "");
    }
  }, [searchParams, selectedArticle, editing]);

  useEffect(() => {
    if (editing && draftPages.length && !draftPages.some((page) => page.id === activeDraftPageId)) {
      setActiveDraftPageId(draftPages[0].id);
    }
  }, [activeDraftPageId, draftPages, editing]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (articleId) {
        const [articleResult, categoryResult] = await Promise.all([
          apiFetch<KnowledgeArticle>(`/knowledge-base/articles/${articleId}`),
          apiFetch<KnowledgeCategory[]>("/knowledge-base/categories")
        ]);
        setDetailArticle(articleResult);
        setSelectedArticleId(articleResult.id);
        setCategories(categoryResult);
        setSearchResults([]);
      } else {
        const params = knowledgeQueryParams();
        const [articleResult, categoryResult, searchResult] = await Promise.all([
          apiFetch<KnowledgeArticle[]>(`/knowledge-base/articles?${params.toString()}`),
          apiFetch<KnowledgeCategory[]>("/knowledge-base/categories"),
          search.trim() ? apiFetch<KnowledgeSearchResult[]>(`/knowledge-base/articles/search?${params.toString()}`) : Promise.resolve([])
        ]);
        setArticles(articleResult);
        setSelectedArticleIds((current) => current.filter((id) => articleResult.some((article) => article.id === id)));
        setSearchResults(searchResult);
        setCategories(categoryResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Knowledge Base.");
    } finally {
      setLoading(false);
    }
  }

  function knowledgeQueryParams() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    return params;
  }

  async function loadOneNoteStatus() {
    try {
      const result = await apiFetch<OneNoteStatus>("/knowledge-base/import/onenote/status");
      setOneNoteStatus(result);
      setOneNoteCategoryId(result.defaultCategoryId ?? "");
    } catch {
      setOneNoteStatus({ enabled: false, configured: false, defaultCategoryId: null });
    }
  }

  function persistActiveEditorPage() {
    if (!editing || !activeDraftPage || !editorRef.current) return draftPages;
    const content = editorRef.current.innerHTML;
    const nextPages = draftPages.map((page) => (page.id === activeDraftPage.id ? { ...page, content } : page));
    setDraft((current) => ({ ...current, pages: nextPages }));
    return nextPages;
  }

  function startNewArticle() {
    const next = emptyDraft();
    setSelectedArticleId("");
    setDraft(next);
    setActiveDraftPageId(next.pages?.[0]?.id ?? "");
    setEditing(true);
    setNotice(null);
  }

  function startEditArticle() {
    if (!selectedArticle) return;
    const pages = selectedArticle.pages?.length ? selectedArticle.pages : [legacyPage(selectedArticle)];
    setDraft({ ...selectedArticle, pages });
    setActiveDraftPageId(pages[0]?.id ?? "");
    setEditing(true);
    setNotice(null);
  }

  function switchDraftPage(pageId: string) {
    persistActiveEditorPage();
    setActiveDraftPageId(pageId);
  }

  function addDraftPage() {
    const pages = persistActiveEditorPage();
    const page = newPage(`Page ${pages.length + 1}`);
    page.sortOrder = pages.length;
    setDraft((current) => ({ ...current, pages: [...pages, page] }));
    setActiveDraftPageId(page.id);
  }

  function removeDraftPage(pageId: string) {
    const pages = persistActiveEditorPage();
    if (pages.length <= 1) return;
    const nextPages = pages.filter((page) => page.id !== pageId).map((page, index) => ({ ...page, sortOrder: index }));
    setDraft((current) => ({ ...current, pages: nextPages }));
    setActiveDraftPageId(nextPages[0]?.id ?? "");
  }

  function updateDraftPage(pageId: string, patch: Partial<KnowledgeArticlePage>) {
    setDraft((current) => ({
      ...current,
      pages: (current.pages ?? []).map((page) => (page.id === pageId ? { ...page, ...patch } : page))
    }));
  }

  async function saveArticle(event?: FormEvent) {
    event?.preventDefault();
    const pages = persistActiveEditorPage().map((page, index) => ({ ...page, sortOrder: index }));
    if (!draft.title?.trim() || !pages.some((page) => page.content.trim())) {
      setError("Title and at least one page with content are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: draft.title,
        content: composeContent(pages),
        accentColor: draft.accentColor || null,
        pages: pages.map((page, index) => ({ ...page, sortOrder: index })),
        categoryId: draft.categoryId || null,
        tags: normalizeTags(draft.tags),
        status: draft.status ?? "DRAFT",
        visibility: draft.visibility ?? "INTERNAL"
      };
      const saved = selectedArticleId
        ? await apiFetch<KnowledgeArticle>(`/knowledge-base/articles/${selectedArticleId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiFetch<KnowledgeArticle>("/knowledge-base/articles", { method: "POST", body: JSON.stringify(payload) });
      setSelectedArticleId(saved.id);
      setDraft(saved);
      setDetailArticle(saved);
      setActiveViewPageId(saved.pages?.[0]?.id ?? "");
      setEditing(false);
      setNotice("Article saved.");
      if (!isDetailMode) {
        router.push(`/knowledge-base/${saved.id}`);
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save article.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(nextStatus: KnowledgeStatus) {
    if (!selectedArticle) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<KnowledgeArticle>(`/knowledge-base/articles/${selectedArticle.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      setDraft(updated);
      setDetailArticle(updated);
      setNotice(`Article moved to ${label(nextStatus)}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update article status.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArticle() {
    if (!selectedArticle || !window.confirm("Archive and delete this article from the active Knowledge Base?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/knowledge-base/articles/${selectedArticle.id}`, { method: "DELETE" });
      setSelectedArticleId("");
      setDetailArticle(null);
      setDraft(emptyDraft());
      setNotice("Article deleted.");
      if (isDetailMode) {
        router.push("/knowledge-base");
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete article.");
    } finally {
      setBusy(false);
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const category = await apiFetch<KnowledgeCategory>("/knowledge-base/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName.trim() })
      });
      setNewCategoryName("");
      setCategoryId(category.id);
      setDraft((current) => ({ ...current, categoryId: category.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create category.");
    } finally {
      setBusy(false);
    }
  }

  function openArticle(targetArticleId: string, pageId?: string | null) {
    const params = new URLSearchParams();
    if (pageId) params.set("page", pageId);
    if (search.trim()) params.set("q", search.trim());
    router.push(`/knowledge-base/${targetArticleId}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function toggleSelectedArticle(articleId: string, checked: boolean) {
    setSelectedArticleIds((current) => (checked ? [...new Set([...current, articleId])] : current.filter((id) => id !== articleId)));
  }

  function toggleAllVisibleArticles(checked: boolean) {
    setSelectedArticleIds(checked ? articles.map((article) => article.id) : []);
  }

  async function bulkUpdateStatus(nextStatus: KnowledgeStatus) {
    if (!selectedArticleIds.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ updated: number }>("/knowledge-base/articles/bulk-status", {
        method: "POST",
        body: JSON.stringify({ articleIds: selectedArticleIds, status: nextStatus })
      });
      setSelectedArticleIds([]);
      setNotice(`${result.updated} article${result.updated === 1 ? "" : "s"} moved to ${label(nextStatus)}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update selected articles.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDeleteArticles() {
    if (!selectedArticleIds.length) return;
    if (!window.confirm(`Delete ${selectedArticleIds.length} selected article${selectedArticleIds.length === 1 ? "" : "s"} from the active Knowledge Base?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ deleted: number }>("/knowledge-base/articles/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ articleIds: selectedArticleIds })
      });
      setSelectedArticleIds([]);
      setNotice(`${result.deleted} article${result.deleted === 1 ? "" : "s"} deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete selected articles.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadInlineImage(file: File) {
    if (!selectedArticleId) {
      setError("Save the article before inserting images.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    try {
      const attachment = await apiFetch<KnowledgeAttachment>(`/knowledge-base/articles/${selectedArticleId}/attachments?inline=true`, {
        method: "POST",
        body: formData
      });
      const imageUrl = `${apiBaseUrl}/knowledge-base/articles/${selectedArticleId}/attachments/${attachment.id}/preview`;
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, `<img src="${imageUrl}" data-attachment-id="${attachment.id}" alt="${attachment.originalFilename}" style="max-width:100%;height:auto;" />`);
      setNotice("Image inserted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload image.");
    } finally {
      setBusy(false);
    }
  }

  async function previewPdf(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ items: ImportItem[]; itemCount: number }>("/knowledge-base/import/pdf/preview", {
        method: "POST",
        body: formData
      });
      setImportItems(result.items.map((item) => ({ ...item, accentColor: item.accentColor ?? accentPalette[0], pages: item.pages ?? [{ title: item.title, content: item.content, sortOrder: 0 }] })));
      setImportSource("PDF");
      setShowImportReview(true);
      setNotice(`${result.itemCount} import candidates detected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview PDF import.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ imported: number }>("/knowledge-base/import/commit", {
        method: "POST",
        body: JSON.stringify({ items: importItems.map((item) => ({ ...item, content: composeContent(item.pages ?? [{ title: item.title, content: item.content }]) })) })
      });
      setShowImportReview(false);
      setImportItems([]);
      setNotice(`${result.imported} articles imported as drafts.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import articles.");
    } finally {
      setBusy(false);
    }
  }

  function updateImportItem(id: string, patch: Partial<ImportItem>) {
    setImportItems((current) => current.map((item) => (item.temporaryId === id ? { ...item, ...patch } : item)));
  }

  function updateImportPage(itemId: string, pageIndex: number, patch: Partial<ImportPage>) {
    setImportItems((current) => current.map((item) => {
      if (item.temporaryId !== itemId) return item;
      const pages = [...(item.pages ?? [])];
      pages[pageIndex] = { ...pages[pageIndex], ...patch };
      return { ...item, pages, content: composeContent(pages) };
    }));
  }

  async function openOneNoteImport() {
    setShowOneNoteImport(true);
    setError(null);
    setNotice(null);
    setOneNoteImportError(null);
    setOneNoteImportProgress(null);
    if (!oneNoteNotebooks.length) await loadOneNoteNotebooks();
  }

  async function loadOneNoteNotebooks() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<OneNoteNotebook[]>("/knowledge-base/import/onenote/notebooks");
      setOneNoteNotebooks(result);
    } catch (err) {
      setOneNoteImportError(err instanceof Error ? err.message : "Unable to load OneNote notebooks.");
    } finally {
      setBusy(false);
    }
  }

  async function selectOneNoteNotebook(notebookId: string) {
    setSelectedNotebookId(notebookId);
    setOneNoteSections([]);
    setSelectedSectionIds([]);
    setOneNoteImportProgress(null);
    if (!notebookId) return;
    setBusy(true);
    setOneNoteImportError(null);
    try {
      const result = await apiFetch<OneNoteSection[]>(`/knowledge-base/import/onenote/sections?notebookId=${encodeURIComponent(notebookId)}`);
      setOneNoteSections(result);
    } catch (err) {
      setOneNoteImportError(err instanceof Error ? err.message : "Unable to load OneNote sections.");
    } finally {
      setBusy(false);
    }
  }

  function toggleOneNoteSection(sectionId: string, checked: boolean) {
    setSelectedSectionIds((current) => (checked ? [...new Set([...current, sectionId])] : current.filter((id) => id !== sectionId)));
  }

  async function previewOneNoteImport() {
    if (!selectedSectionIds.length) {
      setOneNoteImportError("Select at least one OneNote section to import.");
      return;
    }
    setBusy(true);
    setOneNoteImportError(null);
    setOneNoteImportProgress(`Preparing 0 of ${selectedSectionIds.length} sections...`);
    try {
      const items: ImportItem[] = [];
      for (const [index, sectionId] of selectedSectionIds.entries()) {
        const section = oneNoteSections.find((item) => item.id === sectionId);
        setOneNoteImportProgress(`Preparing ${index + 1} of ${selectedSectionIds.length}: ${section?.displayName ?? "OneNote section"}...`);
        const result = await apiFetch<{ items: ImportItem[]; itemCount: number }>("/knowledge-base/import/onenote/preview", {
          method: "POST",
          body: JSON.stringify({ sectionIds: [sectionId], categoryId: oneNoteCategoryId || null })
        });
        items.push(...result.items.map((item) => ({ ...item, accentColor: item.accentColor ?? accentPalette[items.length % accentPalette.length] })));
      }
      setImportItems(items);
      setImportSource("OneNote");
      setShowOneNoteImport(false);
      setShowImportReview(true);
      setNotice(`${items.length} OneNote sections ready for review.`);
    } catch (err) {
      setOneNoteImportError(cleanApiError(err, "Unable to preview OneNote import."));
    } finally {
      setOneNoteImportProgress(null);
      setBusy(false);
    }
  }

  return (
    <div className="knowledge-workspace">
      {isDetailMode ? (
        <div className="form-actions knowledge-detail-nav">
          <button className="button secondary" type="button" onClick={() => router.push("/knowledge-base")}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to Knowledge Base</span>
          </button>
        </div>
      ) : null}
      {notice ? <div className="success-banner">{notice}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {!isDetailMode ? (
        <section className="knowledge-toolbar panel">
          <div className="knowledge-toolbar-main">
            <label className="input-with-icon">
              <Search size={16} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles, pages, or tags" />
            </label>
            <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select className="input" value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">All tags</option>
              {allTags.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="knowledge-view-toggle" aria-label="Knowledge Base view mode">
              <button className={`icon-button ${viewMode === "list" ? "active" : ""}`} type="button" onClick={() => setViewMode("list")} aria-label="List view">
                <Table2 size={16} aria-hidden="true" />
              </button>
              <button className={`icon-button ${viewMode === "cards" ? "active" : ""}`} type="button" onClick={() => setViewMode("cards")} aria-label="Card view">
                <Grid3X3 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="form-actions knowledge-actions">
            <button className="button" type="button" onClick={startNewArticle}>
              <Plus size={16} aria-hidden="true" />
              <span>New Article</span>
            </button>
            <button className="button secondary" type="button" onClick={() => pdfInputRef.current?.click()}>
              <FileUp size={16} aria-hidden="true" />
              <span>Import PDF</span>
            </button>
            <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => event.target.files?.[0] && void previewPdf(event.target.files[0])} />
            {oneNoteStatus.enabled ? (
              <button className="button secondary" type="button" onClick={() => void openOneNoteImport()} disabled={!oneNoteStatus.configured || busy}>
                <BookOpen size={16} aria-hidden="true" />
                <span>Import OneNote</span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!isDetailMode ? (
      <section className="panel knowledge-catalog-panel">
        <div className="section-heading compact-heading">
          <div>
            <h2>Knowledge Articles</h2>
            <p className="muted">{articles.length} articles across {categories.length} categories</p>
          </div>
          <div className="knowledge-category-create">
            <input className="input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category" />
            <button className="button secondary" type="button" onClick={createCategory} disabled={busy}>Add</button>
          </div>
        </div>
        {search.trim() ? (
          <div className="knowledge-search-results">
            <div className="section-heading compact-heading">
              <div>
                <h3>Search Results</h3>
                <p className="muted">{searchResults.length} match{searchResults.length === 1 ? "" : "es"} for "{search.trim()}"</p>
              </div>
            </div>
            {searchResults.length === 0 && !loading ? <p className="muted">No matching article pages found.</p> : null}
            {searchResults.slice(0, 8).map((result) => (
              <button className="knowledge-search-result" type="button" key={`${result.articleId}-${result.pageId ?? result.matchType}`} onClick={() => openArticle(result.articleId, result.pageId)}>
                <span>
                  <strong>{result.articleTitle}</strong>
                  <small>{result.pageTitle ? `${result.pageTitle} page` : label(result.matchType)} - {result.categoryName ?? "Uncategorized"} - {label(result.articleStatus)}</small>
                </span>
                <span className="knowledge-search-snippet">{result.snippet}</span>
              </button>
            ))}
            {searchResults.length > 8 ? <p className="muted">Showing the first 8 matches. Refine the search to narrow results.</p> : null}
          </div>
        ) : null}
        {selectedArticleIds.length ? (
          <div className="knowledge-bulk-bar">
            <strong>{selectedArticleIds.length} selected</strong>
            <div className="form-actions">
              <button className="button secondary" type="button" onClick={() => void bulkUpdateStatus("PUBLISHED")} disabled={busy}>Publish</button>
              <button className="button secondary" type="button" onClick={() => void bulkUpdateStatus("DRAFT")} disabled={busy}>Unpublish</button>
              <button className="button danger" type="button" onClick={() => void bulkDeleteArticles()} disabled={busy}>
                <Trash2 size={16} aria-hidden="true" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ) : null}
        {loading ? <p className="muted">Loading articles...</p> : null}
        {!loading && articles.length === 0 ? <p className="muted">No articles match the current filters.</p> : null}
        {viewMode === "list" ? (
          <div className="knowledge-table" role="table" aria-label="Knowledge articles">
            <div className="knowledge-table-row header" role="row">
              <span>
                <input type="checkbox" checked={articles.length > 0 && selectedArticleIds.length === articles.length} onChange={(event) => toggleAllVisibleArticles(event.target.checked)} aria-label="Select all visible articles" />
              </span>
              <span>Article</span>
              <span>Category</span>
              <span>Status</span>
              <span>Pages</span>
              <span>Updated</span>
            </div>
            {articles.map((article) => (
              <div className={`knowledge-table-row ${selectedArticleIds.includes(article.id) ? "active" : ""}`} role="row" key={article.id}>
                <span>
                  <input type="checkbox" checked={selectedArticleIds.includes(article.id)} onChange={(event) => toggleSelectedArticle(article.id, event.target.checked)} aria-label={`Select ${article.title}`} />
                </span>
                <button className="knowledge-row-open" type="button" onClick={() => openArticle(article.id)}>
                <span className="knowledge-title-cell"><i style={{ backgroundColor: article.accentColor ?? accentPalette[0] }} />{article.title}</span>
                <span>{article.category?.name ?? "Uncategorized"}</span>
                <span>{label(article.status)}</span>
                <span>{article.pages?.length ?? 1}</span>
                <span>{new Date(article.updatedAt).toLocaleDateString()}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="knowledge-card-grid">
            {articles.map((article) => (
              <article className={`knowledge-card ${selectedArticleIds.includes(article.id) ? "active" : ""}`} style={{ borderTopColor: article.accentColor ?? accentPalette[0] }} key={article.id}>
                <label className="knowledge-card-check">
                  <input type="checkbox" checked={selectedArticleIds.includes(article.id)} onChange={(event) => toggleSelectedArticle(article.id, event.target.checked)} />
                  <span>Select</span>
                </label>
                <button className="knowledge-card-open" type="button" onClick={() => openArticle(article.id)}>
                  <span className={`status-pill ${article.status === "PUBLISHED" ? "success" : article.status === "ARCHIVED" ? "muted-pill" : ""}`}>{label(article.status)}</span>
                  <strong>{article.title}</strong>
                  <small>{article.category?.name ?? "Uncategorized"} - {article.pages?.length ?? 1} page{(article.pages?.length ?? 1) === 1 ? "" : "s"}</small>
                  <span className="knowledge-tag-line">{article.tags.slice(0, 3).map((item) => <span className="tag-chip" key={item}>{item}</span>)}</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {(isDetailMode || editing) ? (
      <main className="panel knowledge-detail-panel">
        {editing ? (
          <form className="knowledge-editor" onSubmit={saveArticle}>
            <div className="knowledge-editor-top">
              <input className="input knowledge-title-input" value={draft.title ?? ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Article title" />
              <div className="knowledge-color-palette" aria-label="Article color">
                {accentPalette.map((color) => (
                  <button className={draft.accentColor === color ? "active" : ""} style={{ backgroundColor: color }} type="button" key={color} onClick={() => setDraft((current) => ({ ...current, accentColor: color }))} aria-label={`Use color ${color}`} />
                ))}
              </div>
            </div>
            <div className="knowledge-editor-grid">
              <select className="input" value={draft.categoryId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value || null }))}>
                <option value="">Uncategorized</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select className="input" value={draft.status ?? "DRAFT"} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as KnowledgeStatus }))}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <input className="input" value={(draft.tags ?? []).join(", ")} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(",") }))} placeholder="Tags, separated by commas" />
            </div>
            <div className="knowledge-page-editor-layout">
              <aside className="knowledge-page-nav">
                {draftPages.map((page, index) => (
                  <button className={page.id === activeDraftPage?.id ? "active" : ""} type="button" key={page.id} onClick={() => switchDraftPage(page.id)}>
                    <span>{page.title || `Page ${index + 1}`}</span>
                    <small>Page {index + 1}</small>
                  </button>
                ))}
                <button className="button secondary" type="button" onClick={addDraftPage}>
                  <Plus size={16} aria-hidden="true" />
                  <span>Add Page</span>
                </button>
              </aside>
              <section className="knowledge-page-editor">
                <div className="knowledge-page-title-row">
                  <input className="input" value={activeDraftPage?.title ?? ""} onChange={(event) => activeDraftPage && updateDraftPage(activeDraftPage.id, { title: event.target.value })} placeholder="Page title" />
                  <button className="button secondary" type="button" onClick={() => activeDraftPage && removeDraftPage(activeDraftPage.id)} disabled={draftPages.length <= 1}>Remove</button>
                </div>
                <div className="editor-toolbar">
                  {editorCommands.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button className="icon-button" type="button" key={item.command} onClick={() => document.execCommand(item.command)} title={item.label} aria-label={item.label}>
                        <Icon size={16} aria-hidden="true" />
                      </button>
                    );
                  })}
                  <button className="button secondary" type="button" onClick={() => imageInputRef.current?.click()} disabled={!selectedArticleId}>
                    <ImagePlus size={16} aria-hidden="true" />
                    <span>Image</span>
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && void uploadInlineImage(event.target.files[0])} />
                </div>
                <div
                  key={activeDraftPage?.id}
                  ref={editorRef}
                  className="knowledge-rich-editor"
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: activeDraftPage?.content ?? "" }}
                />
              </section>
            </div>
            <div className="form-actions">
              <button className="button" type="submit" disabled={busy}>
                <Save size={16} aria-hidden="true" />
                <span>Save Article</span>
              </button>
              <button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : selectedArticle ? (
          <article className="knowledge-article-view">
            <div className="knowledge-detail-header">
              <div>
                <span className={`status-pill ${selectedArticle.status === "PUBLISHED" ? "success" : selectedArticle.status === "ARCHIVED" ? "muted-pill" : ""}`}>{label(selectedArticle.status)}</span>
                <h2>{selectedArticle.title}</h2>
                <p className="muted">{selectedArticle.category?.name ?? "Uncategorized"} - Updated {new Date(selectedArticle.updatedAt).toLocaleString()}</p>
              </div>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={startEditArticle}>
                  <Edit3 size={16} aria-hidden="true" />
                  <span>Edit</span>
                </button>
                <button className="button secondary" type="button" onClick={() => void updateStatus(selectedArticle.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")} disabled={busy}>
                  <Eye size={16} aria-hidden="true" />
                  <span>{selectedArticle.status === "PUBLISHED" ? "Draft" : "Publish"}</span>
                </button>
                <button className="button secondary" type="button" onClick={() => void updateStatus("ARCHIVED")} disabled={busy}>
                  <Archive size={16} aria-hidden="true" />
                  <span>Archive</span>
                </button>
                <button className="button danger" type="button" onClick={() => void deleteArticle()} disabled={busy}>
                  <Trash2 size={16} aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
            <div className="knowledge-tag-line">{selectedArticle.tags.map((item) => <span className="tag-chip" key={item}>{item}</span>)}</div>
            <div className="knowledge-readable-layout">
              {selectedArticlePages.length > 1 ? (
                <aside className="knowledge-page-nav read">
                  {selectedArticlePages.map((page, index) => (
                    <button className={page.id === activeViewPage?.id ? "active" : ""} type="button" key={page.id} onClick={() => setActiveViewPageId(page.id)}>
                      <span>{page.title}</span>
                      <small>Page {index + 1}</small>
                    </button>
                  ))}
                </aside>
              ) : null}
              <section className="knowledge-page-view">
                {activeViewPage ? (
                  <>
                    <h3>{activeViewPage.title}</h3>
                    <div className="knowledge-content" dangerouslySetInnerHTML={{ __html: activeViewPage.content }} />
                  </>
                ) : <div className="knowledge-content" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />}
              </section>
            </div>
            {visibleAttachments.length > 0 ? (
              <div className="knowledge-attachments">
                <h3>Files</h3>
                {visibleAttachments.map((attachment) => (
                  <a href={`${apiBaseUrl}/knowledge-base/articles/${selectedArticle.id}/attachments/${attachment.id}/preview`} target="_blank" rel="noreferrer" key={attachment.id}>
                    {attachment.originalFilename}
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ) : loading ? (
          <div className="empty-state-panel">
            <h2>Loading article...</h2>
            <p className="muted">Preparing article content.</p>
          </div>
        ) : (
          <div className="empty-state-panel">
            <h2>No article selected</h2>
            <p className="muted">Create a new article or select one from the list.</p>
          </div>
        )}
      </main>
      ) : null}

      {showImportReview ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel knowledge-import-modal" role="dialog" aria-modal="true" aria-labelledby="kb-import-title">
            <div className="modal-header">
              <div>
                <h2 id="kb-import-title">Review {importSource} Import</h2>
                <p className="muted">Each candidate becomes one structured article. Edit titles, colors, pages, and content before importing.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowImportReview(false)} aria-label="Close import review">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="knowledge-import-list">
              {importItems.map((item) => (
                <div className={`knowledge-import-card ${item.selected === false ? "muted-import" : ""}`} style={{ borderTopColor: item.accentColor ?? accentPalette[0] }} key={item.temporaryId}>
                  <label className="checkbox-card">
                    <input type="checkbox" checked={item.selected !== false} onChange={(event) => updateImportItem(item.temporaryId, { selected: event.target.checked })} />
                    <span>{item.alreadyImported ? "Already imported" : "Import this article"}</span>
                  </label>
                  <div className="knowledge-editor-top">
                    <input className="input" value={item.title} onChange={(event) => updateImportItem(item.temporaryId, { title: event.target.value })} />
                    <div className="knowledge-color-palette" aria-label="Import article color">
                      {accentPalette.map((color) => (
                        <button className={item.accentColor === color ? "active" : ""} style={{ backgroundColor: color }} type="button" key={color} onClick={() => updateImportItem(item.temporaryId, { accentColor: color })} aria-label={`Use color ${color}`} />
                      ))}
                    </div>
                  </div>
                  <div className="knowledge-editor-grid">
                    <input className="input" value={item.categoryName ?? ""} onChange={(event) => updateImportItem(item.temporaryId, { categoryName: event.target.value })} placeholder="Category" />
                    <input className="input" value={item.tags.join(", ")} onChange={(event) => updateImportItem(item.temporaryId, { tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="Tags" />
                  </div>
                  {item.sensitiveWarnings.length ? <p className="warning-text">Review sensitive content: {item.sensitiveWarnings.map(label).join(", ")}</p> : null}
                  {item.sourceUrl ? <a className="muted" href={item.sourceUrl} target="_blank" rel="noreferrer">Open original section</a> : null}
                  <div className="knowledge-import-pages">
                    {(item.pages ?? [{ title: item.title, content: item.content }]).map((page, index) => (
                      <div className="knowledge-import-page" key={`${item.temporaryId}-${index}`}>
                        <input className="input" value={page.title} onChange={(event) => updateImportPage(item.temporaryId, index, { title: event.target.value })} />
                        <textarea className="input" rows={6} value={stripHtml(page.content)} onChange={(event) => updateImportPage(item.temporaryId, index, { content: `<pre>${escapeHtml(event.target.value)}</pre>` })} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowImportReview(false)}>Cancel</button>
              <button className="button" type="button" onClick={() => void commitImport()} disabled={busy}>
                <UploadCloud size={16} aria-hidden="true" />
                <span>Import Selected Drafts</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showOneNoteImport ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel knowledge-import-modal" role="dialog" aria-modal="true" aria-labelledby="kb-onenote-title">
            <div className="modal-header">
              <div>
                <h2 id="kb-onenote-title">Import OneNote Sections</h2>
                <p className="muted">Select one or more sections. Each section becomes an article, and its pages become editable article pages.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowOneNoteImport(false)} aria-label="Close OneNote import">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {oneNoteImportError ? <div className="error-banner">{oneNoteImportError}</div> : null}
            {oneNoteImportProgress ? <div className="success-banner subtle-banner">{oneNoteImportProgress}</div> : null}
            <div className="onenote-import-grid">
              <label className="field">
                <span>Notebook</span>
                <select className="input" value={selectedNotebookId} onChange={(event) => void selectOneNoteNotebook(event.target.value)}>
                  <option value="">Select notebook</option>
                  {oneNoteNotebooks.map((notebook) => (
                    <option key={notebook.id} value={notebook.id}>{formatOneNoteNotebookLabel(notebook)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Import category</span>
                <select className="input" value={oneNoteCategoryId} onChange={(event) => setOneNoteCategoryId(event.target.value)}>
                  <option value="">Imported</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="onenote-page-list">
              {!selectedNotebookId ? <p className="muted">Choose a notebook to list sections.</p> : null}
              {selectedNotebookId && oneNoteSections.length === 0 ? <p className="muted">No sections found in this notebook.</p> : null}
              {oneNoteSections.map((section) => (
                <label className="onenote-page-row" key={section.id}>
                  <input type="checkbox" checked={selectedSectionIds.includes(section.id)} onChange={(event) => toggleOneNoteSection(section.id, event.target.checked)} />
                  <span>
                    <strong>{section.displayName || "Untitled section"}</strong>
                    <small>Import this section and all pages inside it.</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowOneNoteImport(false)}>Cancel</button>
              <button className="button" type="button" onClick={() => void previewOneNoteImport()} disabled={busy || selectedSectionIds.length === 0}>
                <UploadCloud size={16} aria-hidden="true" />
                <span>Review Selected Sections</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function legacyPage(article: KnowledgeArticle): KnowledgeArticlePage {
  return { id: `${article.id}-content`, title: "Content", content: article.content, sortOrder: 0 };
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function stripHtml(value: string) {
  return value.replace(/^<pre>/, "").replace(/<\/pre>$/, "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function composeContent(pages: Array<{ title: string; content: string }>) {
  return pages.map((page) => `<section><h2>${escapeHtml(page.title)}</h2>${page.content}</section>`).join("\n");
}

function formatOneNoteNotebookLabel(notebook: OneNoteNotebook) {
  const labels = [notebook.isDefault ? "Default" : null, notebook.isShared ? "Shared" : null, notebook.userRole ?? null].filter(Boolean);
  return labels.length ? `${notebook.displayName} (${labels.join(", ")})` : notebook.displayName;
}

function cleanApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/<!doctype html|<html[\s>]|cf-error-details|cloudflare/i.test(message)) {
    return "The OneNote preview timed out before all selected sections could be prepared. Try again; sections are now prepared one at a time to avoid large requests.";
  }
  return message || fallback;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

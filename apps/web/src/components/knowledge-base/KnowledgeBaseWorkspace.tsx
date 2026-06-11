"use client";

import { Archive, Bold, BookOpen, Edit3, Eye, FileUp, ImagePlus, Italic, List, ListOrdered, Plus, Save, Search, Trash2, Underline, UploadCloud, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiBaseUrl, apiFetch } from "@/lib/api";

type KnowledgeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

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

interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
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
}

interface ImportItem {
  temporaryId: string;
  selected: boolean;
  title: string;
  content: string;
  categoryName: string | null;
  categoryId?: string | null;
  tags: string[];
  status: KnowledgeStatus;
  sensitiveWarnings: string[];
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

interface OneNotePage {
  id: string;
  title: string;
  lastModifiedDateTime?: string;
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyDraft(): Partial<KnowledgeArticle> {
  return {
    title: "",
    content: "<p></p>",
    tags: [],
    status: "DRAFT",
    visibility: "INTERNAL",
    categoryId: null
  };
}

const editorCommands = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
  { command: "insertUnorderedList", label: "Bullet list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered }
];

export function KnowledgeBaseWorkspace() {
  const searchParams = useSearchParams();
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [draft, setDraft] = useState<Partial<KnowledgeArticle>>(emptyDraft());
  const [editing, setEditing] = useState(false);
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
  const [oneNotePages, setOneNotePages] = useState<OneNotePage[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedOneNotePageIds, setSelectedOneNotePageIds] = useState<string[]>([]);
  const [oneNoteCategoryId, setOneNoteCategoryId] = useState("");
  const [oneNoteImportError, setOneNoteImportError] = useState<string | null>(null);

  const selectedArticle = articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null;
  const allTags = useMemo(() => [...new Set(articles.flatMap((article) => article.tags))].sort(), [articles]);
  const visibleAttachments = selectedArticle?.attachments.filter((attachment) => !attachment.isInline) ?? [];

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, status, tag]);

  useEffect(() => {
    void loadOneNoteStatus();
  }, []);

  useEffect(() => {
    const articleId = searchParams.get("articleId");
    if (articleId) {
      setSelectedArticleId(articleId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedArticle && !editing) {
      setDraft(selectedArticle);
    }
  }, [selectedArticle, editing]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (status) params.set("status", status);
      if (tag) params.set("tag", tag);
      const [articleResult, categoryResult] = await Promise.all([
        apiFetch<KnowledgeArticle[]>(`/knowledge-base/articles?${params.toString()}`),
        apiFetch<KnowledgeCategory[]>("/knowledge-base/categories")
      ]);
      setArticles(articleResult);
      setCategories(categoryResult);
      if (!selectedArticleId && articleResult[0]) {
        setSelectedArticleId(articleResult[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Knowledge Base.");
    } finally {
      setLoading(false);
    }
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

  function startNewArticle() {
    setSelectedArticleId("");
    setDraft(emptyDraft());
    setEditing(true);
    setNotice(null);
  }

  function startEditArticle() {
    if (!selectedArticle) return;
    setDraft(selectedArticle);
    setEditing(true);
    setNotice(null);
  }

  async function saveArticle(event?: FormEvent) {
    event?.preventDefault();
    const content = editorRef.current?.innerHTML ?? draft.content ?? "";
    if (!draft.title?.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: draft.title,
        content,
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
      setEditing(false);
      setNotice("Article saved.");
      await loadData();
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
      setDraft(emptyDraft());
      setNotice("Article deleted.");
      await loadData();
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
      setDraft((current) => ({ ...current, categoryId: category.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create category.");
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
      setImportItems(result.items);
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
        body: JSON.stringify({ items: importItems })
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

  async function openOneNoteImport() {
    setShowOneNoteImport(true);
    setError(null);
    setNotice(null);
    setOneNoteImportError(null);
    if (!oneNoteNotebooks.length) {
      await loadOneNoteNotebooks();
    }
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
    setSelectedSectionId("");
    setOneNoteSections([]);
    setOneNotePages([]);
    setSelectedOneNotePageIds([]);
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

  async function selectOneNoteSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    setOneNotePages([]);
    setSelectedOneNotePageIds([]);
    if (!sectionId) return;
    setBusy(true);
    setOneNoteImportError(null);
    try {
      const result = await apiFetch<OneNotePage[]>(`/knowledge-base/import/onenote/pages?sectionId=${encodeURIComponent(sectionId)}`);
      setOneNotePages(result);
    } catch (err) {
      setOneNoteImportError(err instanceof Error ? err.message : "Unable to load OneNote pages.");
    } finally {
      setBusy(false);
    }
  }

  function toggleOneNotePage(pageId: string, checked: boolean) {
    setSelectedOneNotePageIds((current) => (checked ? [...new Set([...current, pageId])] : current.filter((id) => id !== pageId)));
  }

  async function previewOneNoteImport() {
    if (!selectedOneNotePageIds.length) {
      setOneNoteImportError("Select at least one OneNote page to import.");
      return;
    }
    setBusy(true);
    setOneNoteImportError(null);
    try {
      const result = await apiFetch<{ items: ImportItem[]; itemCount: number }>("/knowledge-base/import/onenote/preview", {
        method: "POST",
        body: JSON.stringify({ pageIds: selectedOneNotePageIds, categoryId: oneNoteCategoryId || null })
      });
      setImportItems(result.items);
      setImportSource("OneNote");
      setShowOneNoteImport(false);
      setShowImportReview(true);
      setNotice(`${result.itemCount} OneNote pages ready for review.`);
    } catch (err) {
      setOneNoteImportError(err instanceof Error ? err.message : "Unable to preview OneNote import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="knowledge-workspace">
      {notice ? <div className="success-banner">{notice}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="knowledge-toolbar panel">
        <label className="input-with-icon">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles, body, or tags" />
        </label>
        <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
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

      <section className="knowledge-layout">
        <aside className="panel knowledge-list-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>Articles</h2>
              <p className="muted">{articles.length} articles</p>
            </div>
          </div>
          <div className="knowledge-article-list">
            {loading ? <p className="muted">Loading articles...</p> : null}
            {!loading && articles.length === 0 ? <p className="muted">No articles match the current filters.</p> : null}
            {articles.map((article) => (
              <button className={`knowledge-article-row ${selectedArticle?.id === article.id ? "active" : ""}`} type="button" key={article.id} onClick={() => { setSelectedArticleId(article.id); setEditing(false); }}>
                <strong>{article.title}</strong>
                <span>{article.category?.name ?? "Uncategorized"} - {label(article.status)}</span>
                <span className="knowledge-tag-line">{article.tags.slice(0, 4).map((item) => <span className="tag-chip" key={item}>{item}</span>)}</span>
              </button>
            ))}
          </div>
          <div className="knowledge-category-create">
            <input className="input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category" />
            <button className="button secondary" type="button" onClick={createCategory} disabled={busy}>Add</button>
          </div>
        </aside>

        <main className="panel knowledge-detail-panel">
          {editing ? (
            <form className="knowledge-editor" onSubmit={saveArticle}>
              <input className="input knowledge-title-input" value={draft.title ?? ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Article title" />
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
                ref={editorRef}
                className="knowledge-rich-editor"
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: draft.content ?? "" }}
              />
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
                  <p className="muted">
                    {selectedArticle.category?.name ?? "Uncategorized"} - Updated {new Date(selectedArticle.updatedAt).toLocaleString()}
                  </p>
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
              <div className="knowledge-content" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
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
          ) : (
            <div className="empty-state-panel">
              <h2>No article selected</h2>
              <p className="muted">Create a new article or select one from the list.</p>
            </div>
          )}
        </main>
      </section>

      {showImportReview ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel knowledge-import-modal" role="dialog" aria-modal="true" aria-labelledby="kb-import-title">
            <div className="modal-header">
              <div>
                <h2 id="kb-import-title">Review {importSource} Import</h2>
                <p className="muted">Edit, deselect, or remove candidates before creating draft articles.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowImportReview(false)} aria-label="Close import review">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="knowledge-import-list">
              {importItems.map((item) => (
                <div className={`knowledge-import-card ${item.selected === false ? "muted-import" : ""}`} key={item.temporaryId}>
                  <label className="checkbox-card">
                    <input type="checkbox" checked={item.selected !== false} onChange={(event) => updateImportItem(item.temporaryId, { selected: event.target.checked })} />
                    <span>{item.alreadyImported ? "Already imported" : "Import this article"}</span>
                  </label>
                  <input className="input" value={item.title} onChange={(event) => updateImportItem(item.temporaryId, { title: event.target.value })} />
                  <div className="knowledge-editor-grid">
                    <input className="input" value={item.categoryName ?? ""} onChange={(event) => updateImportItem(item.temporaryId, { categoryName: event.target.value })} placeholder="Category" />
                    <input className="input" value={item.tags.join(", ")} onChange={(event) => updateImportItem(item.temporaryId, { tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="Tags" />
                  </div>
                  {item.sensitiveWarnings.length ? <p className="warning-text">Review sensitive content: {item.sensitiveWarnings.map(label).join(", ")}</p> : null}
                  {item.sourceUrl ? <a className="muted" href={item.sourceUrl} target="_blank" rel="noreferrer">Open original source</a> : null}
                  <textarea className="input" rows={6} value={stripHtml(item.content)} onChange={(event) => updateImportItem(item.temporaryId, { content: `<pre>${escapeHtml(event.target.value)}</pre>` })} />
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
                <h2 id="kb-onenote-title">Import OneNote Pages</h2>
                <p className="muted">Select pages from the configured Microsoft OneNote account. Imported pages become draft articles.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowOneNoteImport(false)} aria-label="Close OneNote import">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {oneNoteImportError ? <div className="error-banner">{oneNoteImportError}</div> : null}
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
                <span>Section</span>
                <select className="input" value={selectedSectionId} onChange={(event) => void selectOneNoteSection(event.target.value)} disabled={!selectedNotebookId}>
                  <option value="">Select section</option>
                  {oneNoteSections.map((section) => (
                    <option key={section.id} value={section.id}>{section.displayName}</option>
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
              {!selectedSectionId ? <p className="muted">Choose a notebook and section to list pages.</p> : null}
              {selectedSectionId && oneNotePages.length === 0 ? <p className="muted">No pages found in this section.</p> : null}
              {oneNotePages.map((page) => (
                <label className="onenote-page-row" key={page.id}>
                  <input type="checkbox" checked={selectedOneNotePageIds.includes(page.id)} onChange={(event) => toggleOneNotePage(page.id, event.target.checked)} />
                  <span>
                    <strong>{page.title || "Untitled page"}</strong>
                    {page.lastModifiedDateTime ? <small>Modified {new Date(page.lastModifiedDateTime).toLocaleString()}</small> : null}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowOneNoteImport(false)}>Cancel</button>
              <button className="button" type="button" onClick={() => void previewOneNoteImport()} disabled={busy || selectedOneNotePageIds.length === 0}>
                <UploadCloud size={16} aria-hidden="true" />
                <span>Review Selected Pages</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function stripHtml(value: string) {
  return value.replace(/^<pre>/, "").replace(/<\/pre>$/, "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function formatOneNoteNotebookLabel(notebook: OneNoteNotebook) {
  const labels = [notebook.isDefault ? "Default" : null, notebook.isShared ? "Shared" : null, notebook.userRole ?? null].filter(Boolean);
  return labels.length ? `${notebook.displayName} (${labels.join(", ")})` : notebook.displayName;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

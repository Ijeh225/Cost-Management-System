import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, getCsrfHeaders } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const DOCUMENT_TYPES = { bill_of_lading: "B/L", assessment: "Assessment", release: "Release",
  permit: "Permit", receipt: "Receipt", other: "Other" };
type Fields = { identifier: string; amount: string; date: string; text: string };
type Review = { id: number; documentId: number; status: string; documentType: string; issuer: string;
  expiresOn: string | null; acceptedFields: string; notes: string; createdAt: string };
type Doc = { id: number; documentType: string; issuer: string | null; expiresOn: string | null;
  originalName: string; mimeType: string; versionNumber: number; previousVersionId: number | null; review: Review | null };
type Profile = { id: number; name: string; jobType: string; cargoType: string; requiredTypes: string };
type Readiness = { configured: boolean; ready: boolean; canReview: boolean; canConfigure: boolean;
  items: { documentType: string; status: string; documentIds: number[] }[];
  documents: Doc[]; profiles: Profile[]; history: { review: Review; reviewerName: string | null }[];
  applications: { application: { id: number; createdAt: string }; profile: Profile; appliedByName: string | null }[] };
type Extraction = { status: string; error: string | null; pages: { page: number; text: string; confidence?: number | null }[];
  suggestions: { field: string; value: string; page: number; confidence: number | null }[] };
const emptyFields: Fields = { identifier: "", amount: "", date: "", text: "" };
const selectClass = "w-full rounded-md border bg-background p-2 text-sm";

export function DocumentReadiness({ containerId, reviewId, onReview, onChanged }: {
  containerId: number; reviewId: number | null; onReview: (id: number | null) => void; onChanged: () => void;
}) {
  const base = `/api/containers/${containerId}/document-readiness`;
  const { data, isLoading, error, refetch } = useQuery<Readiness>({ queryKey: ["document-readiness", containerId], queryFn: () => customFetch(base) });
  const { data: extraction, isFetching: extracting, error: extractionError } = useQuery<Extraction>({
    queryKey: ["document-extraction", containerId, reviewId], enabled: reviewId !== null,
    queryFn: () => customFetch(`${base}/${reviewId}/extraction`),
  });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState({ name: "", jobType: "", cargoType: "", requiredTypes: [] as string[] });
  const doc = data?.documents.find(d => d.id === reviewId);
  const superseded = data?.documents.some(d => d.previousVersionId === reviewId);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [type, setType] = useState("other"), [issuer, setIssuer] = useState(""), [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState(""), [checked, setChecked] = useState(false), [page, setPage] = useState(1);
  useEffect(() => {
    setFields(doc?.review ? JSON.parse(doc.review.acceptedFields) : emptyFields);
    setType(doc?.review?.documentType ?? doc?.documentType ?? "other");
    setIssuer(doc?.review?.issuer ?? doc?.issuer ?? "");
    setExpiry((doc?.review ? doc.review.expiresOn : doc?.expiresOn) ?? "");
    setNotes(""); setChecked(false); setPage(1); setMessage("");
  }, [reviewId, doc?.id, doc?.review?.id]);
  const post = async (suffix: string, body: unknown) => {
    setBusy(true); setMessage("");
    try {
      await customFetch(`${base}${suffix}`, { method: "POST", headers: { ...await getCsrfHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await refetch(); onChanged(); setMessage("Saved. No workflow or payment was approved.");
      return true;
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save"); return false; }
    finally { setBusy(false); }
  };
  const review = async (status: "reviewed" | "rejected") => {
    if (await post(`/${reviewId}/review`, { status, expectedReviewId: doc?.review?.id ?? null,
      documentType: type, issuer, expiresOn: expiry || null, acceptedFields: fields, notes, sourceChecked: checked })) onReview(null);
  };
  const typeName = (value: string) => DOCUMENT_TYPES[value as keyof typeof DOCUMENT_TYPES] ?? value;
  if (isLoading) return <p role="status">Loading document readiness...</p>;
  if (!data) return <div role="alert">Unable to load readiness. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;
  return <section className="rounded-xl border p-4 space-y-4">
    <div><h3 className="font-semibold">Document readiness</h3>
      <p className="text-sm text-muted-foreground">{!data.configured ? "Not configured: an upload is not a reviewed checklist." : data.ready ? "Required documents reviewed and current" : "Documents need attention"}</p>
      <p className="text-xs text-muted-foreground">Applies to this container visit only. Reviews do not release jobs or approve payments. Expiry uses Lagos dates.</p></div>
    {error && <p role="alert">Refresh failed; showing the previous snapshot.</p>}
    {data.applications[0] && <p className="text-sm">Profile: {data.applications[0].profile.name} ({data.applications[0].profile.jobType} / {data.applications[0].profile.cargoType})</p>}
    <div className="grid gap-2 sm:grid-cols-2">{data.items.map(item => <div key={item.documentType} className="rounded-lg border p-3">
      <span className="font-medium">{typeName(item.documentType)}</span><span className="ml-2 text-sm capitalize">{item.status === "required" ? "Required / missing" : item.status}</span>
      <div className="flex flex-wrap gap-2">{item.documentIds.map(id => <button key={id} className="text-sm text-primary underline" onClick={() => onReview(id)}>View #{id}</button>)}</div>
    </div>)}</div>
    {data.canReview && <details className="border-t pt-3"><summary className="cursor-pointer font-medium">Configure requirements</summary>
      <div className="space-y-3 pt-3">
        <label className="block text-sm">Job/cargo profile<select aria-label="Job/cargo profile" className={selectClass} value={profileId} onChange={e => setProfileId(e.target.value)}>
          <option value="">Choose a profile</option>{data.profiles.map(p => <option key={p.id} value={p.id}>{p.name} - {p.jobType} / {p.cargoType} (#{p.id})</option>)}</select></label>
        <Button disabled={busy || !profileId} onClick={() => post("/apply", { profileId: Number(profileId), expectedChecklistId: data.applications[0]?.application.id ?? null })}>Apply to this visit</Button>
        {data.canConfigure && <fieldset className="rounded border p-3 space-y-3"><legend className="text-sm">Create a new immutable profile</legend>
          {(["name", "jobType", "cargoType"] as const).map(key => <label key={key} className="block text-sm">{key === "name" ? "Profile name" : key === "jobType" ? "Job type" : "Cargo type"}<Input value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></label>)}
          <div className="flex flex-wrap gap-3">{Object.entries(DOCUMENT_TYPES).map(([key, label]) => <label key={key} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={profile.requiredTypes.includes(key)} onChange={e => setProfile({ ...profile, requiredTypes: e.target.checked ? [...profile.requiredTypes, key] : profile.requiredTypes.filter(t => t !== key) })} />{label}</label>)}</div>
          <Button disabled={busy || !profile.requiredTypes.length || !profile.name.trim() || !profile.jobType.trim() || !profile.cargoType.trim()} onClick={() => post("/profiles", profile)}>Save new profile</Button>
        </fieldset>}
      </div>
    </details>}
    {data.applications.length > 0 && <details><summary className="cursor-pointer text-sm">Requirement history ({data.applications.length})</summary>{data.applications.map(a => <p key={a.application.id} className="text-xs py-1">{a.profile.name} - {a.appliedByName} - {new Date(a.application.createdAt).toLocaleString("en-NG")}</p>)}</details>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <Dialog open={reviewId !== null} onOpenChange={open => !open && onReview(null)}>
      <DialogContent className="max-w-6xl w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Document review{doc ? `: ${doc.originalName} (v${doc.versionNumber})` : ""}</DialogTitle>
          <DialogDescription>Check the original alongside the extraction. Suggestions can be wrong. Accepted values are evidence only, never posted transactions.</DialogDescription></DialogHeader>
        {doc && <div className="grid gap-4 lg:grid-cols-2 min-w-0">
          <div className="min-w-0 space-y-2">
            {doc.mimeType.startsWith("image/") ? <img src={`/api/documents/${doc.id}`} alt={`Original ${doc.originalName}`} className="max-h-[55vh] w-full object-contain border rounded" /> : doc.mimeType === "application/pdf" ?
              <iframe title="Original document page" src={`/api/documents/${doc.id}#page=${page}`} className="w-full h-[55vh] border rounded" /> : <a className="text-primary underline" href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer">Open original file</a>}
            <p className="text-xs">Page {page}. Confidence is OCR page confidence, not a guarantee that any field is correct.</p>
            {extracting && <p role="status">Loading extraction...</p>}
            {extractionError && <p role="alert">Extraction unavailable. Review the original manually.</p>}
            {extraction?.error && <p role="alert" className="text-sm">{extraction.error}</p>}
            {extraction?.pages.map(p => <details key={p.page} className="rounded border p-2"><summary className="cursor-pointer text-sm">Extracted page {p.page} - {p.confidence == null ? "Confidence not measured" : `${p.confidence.toFixed(1)}% confidence${p.confidence < 85 ? " / low confidence" : ""}`}</summary>
              <Button size="sm" variant="outline" onClick={() => setPage(p.page)}>Show source page {p.page}</Button><pre className="whitespace-pre-wrap break-words text-xs max-h-48 overflow-y-auto">{p.text}</pre>
              {data.canReview && !superseded && <Button size="sm" variant="outline" onClick={() => setFields(f => ({ ...f, text: p.text }))}>Use page text for review</Button>}</details>)}
          </div>
          <div className="min-w-0 space-y-3">
            {superseded && <p role="status">Historical version. Review its latest replacement instead.</p>}
            <fieldset disabled={busy || !data.canReview || !!superseded} className="space-y-3">
              <label className="block text-sm">Document type<select className={selectClass} value={type} onChange={e => setType(e.target.value)}>{Object.entries(DOCUMENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="block text-sm">Issuer<Input value={issuer} onChange={e => setIssuer(e.target.value)} maxLength={200} /></label>
              <label className="block text-sm">Expiry (leave blank if not applicable)<Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
              {extraction?.suggestions.map(s => <div key={s.field} className="border rounded p-2 text-sm break-words"><p>Suggested {s.field}: {s.value} (page {s.page}; {s.confidence == null ? "unmeasured confidence" : `${s.confidence.toFixed(1)}% page confidence`})</p>
                <Button size="sm" variant="outline" onClick={() => { setFields(f => ({ ...f, [s.field]: s.value })); setPage(s.page); }}>Use {s.field} suggestion</Button></div>)}
              {(["identifier", "amount", "date"] as const).map(key => <label key={key} className="block text-sm capitalize">Verified {key}<Input value={fields[key]} onChange={e => setFields({ ...fields, [key]: e.target.value })} /></label>)}
              <label className="block text-sm">Verified text<textarea className={selectClass} rows={4} value={fields.text} onChange={e => setFields({ ...fields, text: e.target.value })} /></label>
              <label className="block text-sm">Review notes / rejection reason<textarea className={selectClass} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I checked the source, classification, expiry, identifiers, amounts and dates. No suggestion is accepted automatically.</label>
              <div className="flex flex-wrap gap-2"><Button disabled={!checked || busy} onClick={() => review("reviewed")}>Mark reviewed</Button><Button variant="destructive" disabled={!checked || !notes.trim() || busy} onClick={() => review("rejected")}>Reject with reason</Button></div>
            </fieldset>
            {message && <p role="status">{message}</p>}
            <details><summary className="cursor-pointer">Review history</summary>{data.history.filter(h => h.review.documentId === doc.id).map(h => <div key={h.review.id} className="border-t py-2 text-sm"><p>{h.review.status} by {h.reviewerName} - {new Date(h.review.createdAt).toLocaleString("en-NG")}</p><p>{h.review.notes}</p><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(JSON.parse(h.review.acceptedFields), null, 2)}</pre></div>)}</details>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}

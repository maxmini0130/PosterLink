"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Info,
  Loader2,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@posterlink/ui";

import { ImageCropper } from "../../../../components/ImageCropper";
import { PosterImageFallback } from "../../../../components/PosterImageFallback";
import { fetchCategoryRegionNames } from "../../../../lib/posterHelpers";
import {
  getCityRegions,
  getDistrictRegions,
  getRegionLabel,
  getSelectedCityId,
  getSelectedDistrictId,
} from "../../../../lib/regionHelpers";
import { supabase } from "../../../../lib/supabase";
import {
  buildPosterStructuredUpdate,
  emptyPosterStructuredVerificationReview,
  POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS,
  readPosterStructuredVerificationReview,
  type PosterStructuredEditorValues,
  type PosterStructuredTimestamps,
  type PosterStructuredVerificationCheckKey,
  type PosterStructuredVerificationReview,
  toKstDateInput,
} from "../../../../../lib/posterStructuredEditor";
import { resolvePosterImageUrl } from "../../../../../lib/posterImage";

type EditorForm = PosterStructuredEditorValues & {
  categoryId: string;
  regionId: string;
  noticeLink: string;
  applyLink: string;
  thumbnailUrl: string;
  sourceKey: string;
};

type PosterLink = {
  url: string;
  link_type: string;
  is_primary: boolean | null;
};

const EMPTY_FORM: EditorForm = {
  title: "",
  sourceOrgName: "",
  organizerName: "",
  applicationOrganizationName: "",
  categoryId: "",
  regionId: "",
  appStartAt: "",
  appEndAt: "",
  deadlineType: "unknown",
  eventStartAt: "",
  eventEndAt: "",
  eligibilitySummary: "",
  targetAgeMin: "",
  targetAgeMax: "",
  participationFee: "",
  benefitsSummary: "",
  recruitmentCount: "",
  applicationMethod: "",
  requiredDocuments: "",
  contactInfo: "",
  eventLocation: "",
  summaryShort: "",
  verificationStatus: "unverified",
  dataConfidence: "",
  verifiedAt: "",
  noticeLink: "",
  applyLink: "",
  thumbnailUrl: "",
  sourceKey: "",
};

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-2 block text-xs font-black text-gray-600";
const VERIFICATION_CHECK_LABELS: Record<PosterStructuredVerificationCheckKey, string> = {
  imageMatchesNotice: "포스터 이미지가 원문 공고와 같고 글자를 식별할 수 있음",
  titleAndOrganizations: "제목과 실제 주최·주관·접수 기관을 원문과 대조함",
  applicationSchedule: "모집 기간·마감 유형·행사 일정을 원문과 대조함",
  eligibilityAndBenefits: "신청 대상·연령·비용·혜택·모집 인원을 대조함",
  applicationAndContact: "신청 방법·필요 서류·문의처·행사 장소를 대조함",
  officialLinks: "공식 공고 원문과 신청 페이지 링크를 직접 열어 확인함",
};
const VERIFICATION_SENSITIVE_EDITOR_FIELDS = new Set<keyof EditorForm>([
  "title",
  "sourceOrgName",
  "organizerName",
  "applicationOrganizationName",
  "categoryId",
  "regionId",
  "appStartAt",
  "appEndAt",
  "deadlineType",
  "eventStartAt",
  "eventEndAt",
  "eligibilitySummary",
  "targetAgeMin",
  "targetAgeMax",
  "participationFee",
  "benefitsSummary",
  "recruitmentCount",
  "applicationMethod",
  "requiredDocuments",
  "contactInfo",
  "eventLocation",
  "summaryShort",
  "noticeLink",
  "applyLink",
]);

function structuredValues(form: EditorForm): PosterStructuredEditorValues {
  const {
    categoryId: _categoryId,
    regionId: _regionId,
    noticeLink: _noticeLink,
    applyLink: _applyLink,
    thumbnailUrl: _thumbnailUrl,
    sourceKey: _sourceKey,
    ...values
  } = form;
  return values;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function httpUrlOrEmpty(value: unknown) {
  const candidate = text(value).trim();
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

export default function EditPosterPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const returnPath = searchParams.get("returnTo") === "admin" ? "/admin/posters" : "/operator/posters";

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [newImageBlob, setNewImageBlob] = useState<Blob | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [initialPosterStatus, setInitialPosterStatus] = useState<string | null>(null);
  const [fieldVerification, setFieldVerification] = useState<unknown>(null);
  const [originalTimestamps, setOriginalTimestamps] = useState<PosterStructuredTimestamps>({});
  const [isAdminReviewer, setIsAdminReviewer] = useState(false);
  const [verificationReview, setVerificationReview] = useState<PosterStructuredVerificationReview>(
    emptyPosterStructuredVerificationReview,
  );
  const [formData, setFormData] = useState<EditorForm>(EMPTY_FORM);
  const [initialFormData, setInitialFormData] = useState<EditorForm>(EMPTY_FORM);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const [{ data: cats }, { data: regs }, { data: poster, error: posterError }, { data: profile }] = await Promise.all([
          supabase.from("categories").select("*").order("sort_order"),
          supabase.from("regions").select("*").in("level", ["nation", "sido", "sigungu"]).order("level", { ascending: false }).order("full_name", { ascending: true }),
          supabase.from("posters").select("*").eq("id", id).single(),
          user
            ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (posterError) throw posterError;
        if (cats) setCategories(cats);
        if (regs) setRegions(regs);

        const [{ data: links, error: linksError }, metaMap] = await Promise.all([
          supabase.from("poster_links").select("url,link_type,is_primary").eq("poster_id", id),
          fetchCategoryRegionNames([id]),
        ]);
        if (linksError) throw linksError;
        const posterLinks = (links ?? []) as PosterLink[];
        const noticeLink = posterLinks.find((link) => link.link_type === "official_notice")
          ?? posterLinks.find((link) => link.link_type === "official_homepage")
          ?? posterLinks.find((link) => link.is_primary);
        const applyLink = posterLinks.find((link) => link.link_type === "official_apply");
        const meta = metaMap[id];
        const nextForm: EditorForm = {
          title: text(poster.title),
          sourceOrgName: text(poster.source_org_name),
          organizerName: text(poster.organizer_name),
          applicationOrganizationName: text(poster.application_organization_name),
          categoryId: meta?.categoryId || "",
          regionId: meta?.regionId || "",
          appStartAt: toKstDateInput(poster.application_start_at),
          appEndAt: toKstDateInput(poster.application_end_at),
          deadlineType: poster.deadline_type || "unknown",
          eventStartAt: toKstDateInput(poster.event_start_at),
          eventEndAt: toKstDateInput(poster.event_end_at),
          eligibilitySummary: text(poster.eligibility_summary),
          targetAgeMin: poster.target_age_min == null ? "" : String(poster.target_age_min),
          targetAgeMax: poster.target_age_max == null ? "" : String(poster.target_age_max),
          participationFee: text(poster.participation_fee),
          benefitsSummary: text(poster.benefits_summary),
          recruitmentCount: text(poster.recruitment_count),
          applicationMethod: text(poster.application_method),
          requiredDocuments: text(poster.required_documents),
          contactInfo: text(poster.contact_info),
          eventLocation: text(poster.event_location),
          summaryShort: text(poster.summary_short),
          verificationStatus: poster.verification_status || "unverified",
          dataConfidence: poster.data_confidence == null ? "" : String(poster.data_confidence),
          verifiedAt: text(poster.verified_at),
          noticeLink: noticeLink?.url || httpUrlOrEmpty(poster.source_key),
          applyLink: applyLink?.url || "",
          thumbnailUrl: text(poster.thumbnail_url),
          sourceKey: text(poster.source_key),
        };
        setInitialPosterStatus(poster.poster_status ?? null);
        setRejectionReason(poster.poster_status === "rejected" ? poster.rejection_reason ?? null : null);
        setFieldVerification(poster.field_verification);
        setIsAdminReviewer(profile?.role === "admin" || profile?.role === "super_admin");
        setVerificationReview(readPosterStructuredVerificationReview(poster.field_verification));
        setOriginalTimestamps({
          applicationStartAt: poster.application_start_at,
          applicationEndAt: poster.application_end_at,
          eventStartAt: poster.event_start_at,
          eventEndAt: poster.event_end_at,
        });
        setFormData(nextForm);
        setInitialFormData(nextForm);
      } catch (error: any) {
        toast.error(`포스터를 불러오지 못했습니다: ${error.message}`);
      } finally {
        setInitialLoading(false);
      }
    };

    void fetchData();
  }, [id]);

  const updateForm = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
    if (
      initialFormData.verificationStatus === "verified" &&
      VERIFICATION_SENSITIVE_EDITOR_FIELDS.has(key) &&
      formData[key] !== value
    ) {
      setVerificationReview(emptyPosterStructuredVerificationReview());
    }
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (initialFormData.verificationStatus === "verified") {
      setVerificationReview(emptyPosterStructuredVerificationReview());
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");

      const taxonomyChanged = formData.categoryId !== initialFormData.categoryId
        || formData.regionId !== initialFormData.regionId;
      const linksChanged = formData.noticeLink.trim() !== initialFormData.noticeLink.trim()
        || formData.applyLink.trim() !== initialFormData.applyLink.trim();
      const extraChangedFields = [
        ...(taxonomyChanged ? ["poster_taxonomy"] : []),
        ...(linksChanged ? ["poster_links"] : []),
        ...(newImageBlob ? ["thumbnail_url"] : []),
      ];
      const editorValues = structuredValues(formData);
      const initialEditorValues = structuredValues(initialFormData);
      const hasEditorChanges = JSON.stringify(editorValues) !== JSON.stringify(initialEditorValues)
        || extraChangedFields.length > 0;
      const shouldDemoteOperatorEdit = !isAdminReviewer
        && initialEditorValues.verificationStatus === "verified"
        && hasEditorChanges;
      if (shouldDemoteOperatorEdit) {
        editorValues.verificationStatus = "needs_review";
      }
      const structuredUpdate = buildPosterStructuredUpdate({
        values: editorValues,
        initialValues: initialEditorValues,
        fieldVerification,
        reviewerId: user.id,
        additionalChangedFields: extraChangedFields,
        originalTimestamps,
        verificationReview,
        canVerify: isAdminReviewer,
        officialNoticeUrl: formData.noticeLink,
        hasPosterImage: Boolean(newImageBlob || resolvePosterImageUrl(formData.thumbnailUrl, formData.sourceKey)),
      });

      let thumbnailUrl = formData.thumbnailUrl;
      if (newImageBlob) {
        const filePath = `${user.id}/${Date.now()}_cropped.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("poster-originals")
          .upload(filePath, newImageBlob, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        thumbnailUrl = supabase.storage.from("poster-originals").getPublicUrl(filePath).data.publicUrl;
      }

      if (taxonomyChanged) {
        const [{ error: categoryDeleteError }, { error: regionDeleteError }] = await Promise.all([
          supabase.from("poster_categories").delete().eq("poster_id", id),
          supabase.from("poster_regions").delete().eq("poster_id", id),
        ]);
        if (categoryDeleteError) throw categoryDeleteError;
        if (regionDeleteError) throw regionDeleteError;
        if (formData.categoryId) {
          const { error } = await supabase.from("poster_categories").insert({ poster_id: id, category_id: formData.categoryId });
          if (error) throw error;
        }
        if (formData.regionId) {
          const { error } = await supabase.from("poster_regions").insert({ poster_id: id, region_id: formData.regionId });
          if (error) throw error;
        }
      }

      if (linksChanged) {
        const { error: linkDeleteError } = await supabase
          .from("poster_links")
          .delete()
          .eq("poster_id", id)
          .in("link_type", ["official_notice", "official_apply", "official_homepage"]);
        if (linkDeleteError) throw linkDeleteError;
        const linksToInsert = [
          ...(formData.noticeLink.trim() ? [{
            poster_id: id,
            link_type: "official_notice",
            url: formData.noticeLink.trim(),
            title: "공식 공고 원문",
            is_primary: !formData.applyLink.trim(),
          }] : []),
          ...(formData.applyLink.trim() ? [{
            poster_id: id,
            link_type: "official_apply",
            url: formData.applyLink.trim(),
            title: "공식 신청 페이지",
            is_primary: true,
          }] : []),
        ];
        if (linksToInsert.length > 0) {
          const { error } = await supabase.from("poster_links").insert(linksToInsert);
          if (error) throw error;
        }
      }

      const { error: posterUpdateError } = await supabase
        .from("posters")
        .update({
          ...structuredUpdate.update,
          ...(newImageBlob ? { thumbnail_url: thumbnailUrl } : {}),
          ...(!isAdminReviewer && initialPosterStatus === "rejected"
            ? { poster_status: "review", rejection_reason: null }
            : {}),
        })
        .eq("id", id);
      if (posterUpdateError) throw posterUpdateError;

      if (returnPath === "/admin/posters") {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "admin" || profile?.role === "super_admin") {
          const { error: auditError } = await supabase.from("admin_actions").insert({
            admin_id: user.id,
            target_type: "poster",
            target_id: id,
            action_type: "update",
            action_reason: "구조화 포스터 정보 교정",
            metadata_json: {
              changed_fields: structuredUpdate.changedFields,
              verification_status: editorValues.verificationStatus,
              structured_review_completed: editorValues.verificationStatus === "verified",
              editor: "poster_structured_editor",
            },
          });
          if (auditError) console.error("Failed to write poster edit audit", auditError);
        }
      }

      toast.success(
        !isAdminReviewer && initialPosterStatus === "rejected"
          ? "수정 내용을 저장하고 재검수를 요청했습니다."
          : shouldDemoteOperatorEdit
          ? "수정 내용을 저장하고 사람 검증 상태를 재검토로 변경했습니다."
          : "포스터 정보와 검수 이력을 저장했습니다.",
      );
      router.push(returnPath);
      router.refresh();
    } catch (error: any) {
      toast.error(`저장하지 못했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("포스터를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    const response = await fetch(`/api/posters/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error ?? "포스터를 삭제하지 못했습니다.");
      return;
    }
    router.push(returnPath);
  };

  if (initialLoading) {
    return <div className="p-20 text-center text-sm font-bold text-blue-600">포스터 정보를 불러오는 중...</div>;
  }

  const previewUrl = newImageBlob
    ? URL.createObjectURL(newImageBlob)
    : resolvePosterImageUrl(formData.thumbnailUrl, formData.sourceKey);
  const selectedCityId = getSelectedCityId(formData.regionId, regions);
  const selectedDistrictId = getSelectedDistrictId(formData.regionId, regions);
  const districtRegions = getDistrictRegions(regions, selectedCityId || null);
  const checkedVerificationCount = POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.filter(
    (key) => verificationReview.checks[key],
  ).length;

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {showCropper && originalImage && (
        <ImageCropper
          image={originalImage}
          onCropComplete={(blob) => {
            setNewImageBlob(blob);
            setShowCropper(false);
          }}
          onCancel={() => setShowCropper(false)}
        />
      )}

      <header className="mb-6 flex items-start gap-3">
        <button type="button" onClick={() => router.back()} className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="뒤로">
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-gray-900">포스터 정보 교정</h1>
          <p className="mt-1 text-sm font-semibold text-gray-500">원문과 포스터 이미지를 대조한 뒤 사실 정보와 검증 상태를 저장하세요.</p>
        </div>
      </header>

      {rejectionReason && (
        <div className="mb-6 flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black">관리자 반려 사유</p>
            <p className="mt-1 text-sm font-semibold leading-6">{rejectionReason}</p>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-5 border-y border-gray-200 bg-white py-5 md:grid-cols-[220px_1fr]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-gray-200 bg-gray-50 group">
          <PosterImageFallback
            src={previewUrl}
            alt="포스터 이미지"
            title={formData.title}
            org={formData.organizerName || formData.sourceOrgName}
            fallbackClassName="p-5"
            imgClassName="h-full w-full object-contain"
          />
          <label htmlFor="edit-poster-upload" className="absolute inset-x-3 bottom-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-gray-950/90 px-3 py-2 text-xs font-black text-white opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <Camera size={15} /> 이미지 교체
          </label>
          <input type="file" id="edit-poster-upload" className="sr-only" accept="image/*" onChange={handleImageChange} />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-xs font-black text-gray-500">이미지 검수</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">실제 모집 포스터인지, 글자가 식별 가능한지, 현재 공고와 같은 내용인지 확인하세요.</p>
          <label htmlFor="edit-poster-upload" className="mt-4 inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-black text-gray-700 hover:bg-gray-50">
            <Camera size={16} /> 포스터 이미지 선택
          </label>
          {newImageBlob && <p className="mt-3 flex items-center gap-1.5 text-xs font-black text-emerald-600"><CheckCircle2 size={14} /> 새 이미지가 저장 대기 중입니다.</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <section className="grid gap-5 p-5 md:grid-cols-2 md:p-7">
          <div className="md:col-span-2">
            <h2 className="text-base font-black text-gray-900">기본 정보</h2>
            <p className="mt-1 text-xs font-semibold text-gray-500">수집 출처와 실제 사업 기관은 서로 다를 수 있습니다.</p>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>제목</label>
            <input required value={formData.title} onChange={(e) => updateForm("title", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>수집 출처 기관</label>
            <input required value={formData.sourceOrgName} onChange={(e) => updateForm("sourceOrgName", e.target.value)} className={inputClass} />
            <p className="mt-1.5 text-[11px] font-semibold text-gray-400">게시판·사이트를 운영하는 수집 출처</p>
          </div>
          <div>
            <label className={labelClass}>실제 주최·주관 기관</label>
            <input value={formData.organizerName} onChange={(e) => updateForm("organizerName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>실제 신청 접수 기관</label>
            <input value={formData.applicationOrganizationName} onChange={(e) => updateForm("applicationOrganizationName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>분야</label>
            <select value={formData.categoryId} onChange={(e) => updateForm("categoryId", e.target.value)} className={inputClass}>
              <option value="">선택 안 함</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>시·도</label>
            <select value={selectedCityId} onChange={(e) => updateForm("regionId", e.target.value)} className={inputClass}>
              <option value="">전국</option>
              {getCityRegions(regions).map((region) => <option key={region.id} value={region.id}>{getRegionLabel(region)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>시·군·구</label>
            <select
              value={selectedDistrictId}
              disabled={districtRegions.length === 0}
              onChange={(e) => updateForm("regionId", e.target.value || selectedCityId)}
              className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
            >
              <option value="">{selectedCityId ? "시·도 전체" : "시·도를 먼저 선택"}</option>
              {districtRegions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
          </div>
        </section>

        <section className="grid gap-5 border-t border-gray-200 p-5 md:grid-cols-3 md:p-7">
          <div className="md:col-span-3">
            <h2 className="text-base font-black text-gray-900">일정</h2>
          </div>
          <div>
            <label className={labelClass}>모집 유형</label>
            <select value={formData.deadlineType} onChange={(e) => updateForm("deadlineType", e.target.value as EditorForm["deadlineType"])} className={inputClass}>
              <option value="unknown">미확인</option>
              <option value="fixed">고정 마감</option>
              <option value="ongoing">상시 모집</option>
              <option value="until_exhausted">소진 시 마감</option>
              <option value="scheduled">모집 예정</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>모집 시작일</label>
            <input type="date" value={formData.appStartAt} onChange={(e) => updateForm("appStartAt", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>모집 종료일</label>
            <input type="date" value={formData.appEndAt} onChange={(e) => updateForm("appEndAt", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>행사 시작일</label>
            <input type="date" value={formData.eventStartAt} onChange={(e) => updateForm("eventStartAt", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>행사 종료일</label>
            <input type="date" value={formData.eventEndAt} onChange={(e) => updateForm("eventEndAt", e.target.value)} className={inputClass} />
          </div>
        </section>

        <section className="grid gap-5 border-t border-gray-200 p-5 md:grid-cols-2 md:p-7">
          <div className="md:col-span-2">
            <h2 className="text-base font-black text-gray-900">모집 대상과 제공 내용</h2>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>지원 자격·대상</label>
            <textarea rows={3} value={formData.eligibilitySummary} onChange={(e) => updateForm("eligibilitySummary", e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>최소 연령</label>
              <input type="number" min="0" max="120" value={formData.targetAgeMin} onChange={(e) => updateForm("targetAgeMin", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>최대 연령</label>
              <input type="number" min="0" max="120" value={formData.targetAgeMax} onChange={(e) => updateForm("targetAgeMax", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>모집 인원</label>
            <input value={formData.recruitmentCount} onChange={(e) => updateForm("recruitmentCount", e.target.value)} className={inputClass} placeholder="예: 20명, 선착순" />
          </div>
          <div>
            <label className={labelClass}>참가비</label>
            <input value={formData.participationFee} onChange={(e) => updateForm("participationFee", e.target.value)} className={inputClass} placeholder="예: 무료, 10,000원" />
          </div>
          <div>
            <label className={labelClass}>행사 장소</label>
            <input value={formData.eventLocation} onChange={(e) => updateForm("eventLocation", e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>혜택·지원 내용</label>
            <textarea rows={3} value={formData.benefitsSummary} onChange={(e) => updateForm("benefitsSummary", e.target.value)} className={inputClass} />
          </div>
        </section>

        <section className="grid gap-5 border-t border-gray-200 p-5 md:grid-cols-2 md:p-7">
          <div className="md:col-span-2">
            <h2 className="text-base font-black text-gray-900">신청과 문의</h2>
          </div>
          <div>
            <label className={labelClass}>신청 방법</label>
            <textarea rows={3} value={formData.applicationMethod} onChange={(e) => updateForm("applicationMethod", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>필요 서류</label>
            <textarea rows={3} value={formData.requiredDocuments} onChange={(e) => updateForm("requiredDocuments", e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>문의처</label>
            <input value={formData.contactInfo} onChange={(e) => updateForm("contactInfo", e.target.value)} className={inputClass} placeholder="전화번호, 이메일, 담당 부서" />
          </div>
          <div>
            <label className={labelClass}>공식 공고 원문</label>
            <div className="relative">
              <ExternalLink size={15} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="url" value={formData.noticeLink} onChange={(e) => updateForm("noticeLink", e.target.value)} className={`${inputClass} pl-9`} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className={labelClass}>공식 신청 페이지</label>
            <div className="relative">
              <ExternalLink size={15} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="url" value={formData.applyLink} onChange={(e) => updateForm("applyLink", e.target.value)} className={`${inputClass} pl-9`} placeholder="https://..." />
            </div>
          </div>
        </section>

        <section className="grid gap-5 border-t border-gray-200 p-5 md:grid-cols-2 md:p-7">
          <div className="md:col-span-2">
            <h2 className="text-base font-black text-gray-900">표시 요약과 검증</h2>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>핵심 모집 요약</label>
            <textarea rows={5} value={formData.summaryShort} onChange={(e) => updateForm("summaryShort", e.target.value)} className={`${inputClass} resize-y whitespace-pre-wrap leading-6`} placeholder="대상, 기간, 혜택, 신청 방법을 읽기 좋은 문장과 줄바꿈으로 정리하세요." />
          </div>
          {isAdminReviewer ? (
            <div className="md:col-span-2 border-y border-gray-200 py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-black text-gray-900">사람 검증 체크리스트</h3>
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    포스터와 공식 원문을 직접 대조한 항목만 선택하세요. {checkedVerificationCount}/{POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.length}
                  </p>
                </div>
                {formData.noticeLink && (
                  <a
                    href={formData.noticeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 hover:underline"
                  >
                    <ExternalLink size={14} /> 공식 원문 열기
                  </a>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.map((key) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 text-sm font-semibold leading-6 text-gray-700">
                    <input
                      type="checkbox"
                      checked={verificationReview.checks[key]}
                      onChange={(event) => setVerificationReview((current) => ({
                        ...current,
                        checks: { ...current.checks, [key]: event.target.checked },
                      }))}
                      className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                    />
                    <span>{VERIFICATION_CHECK_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <label className={`${labelClass} mt-5`}>검토 결과 메모</label>
              <textarea
                rows={3}
                value={verificationReview.note}
                onChange={(event) => setVerificationReview((current) => ({ ...current, note: event.target.value }))}
                className={`${inputClass} resize-y leading-6`}
                placeholder="원문에서 확인한 내용, 비어 있는 항목의 이유, 교정한 내용을 기록하세요."
              />
            </div>
          ) : (
            <div className="md:col-span-2 flex gap-2 border-y border-gray-200 py-4 text-xs font-semibold leading-5 text-gray-600">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
              운영자가 내용을 수정하면 기존 사람 검증은 자동으로 재검토 상태가 됩니다. 최종 검증 완료 승인은 관리자만 할 수 있습니다.
            </div>
          )}
          <div>
            <label className={labelClass}>검증 상태</label>
            <select value={formData.verificationStatus} onChange={(e) => updateForm("verificationStatus", e.target.value as EditorForm["verificationStatus"])} className={inputClass}>
              <option value="unverified">미검증</option>
              <option value="needs_review">추가 검토 필요</option>
              <option value="verified" disabled={!isAdminReviewer}>사람 검증 완료</option>
              <option value="rejected">데이터 사용 불가</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>데이터 신뢰도</label>
            <input type="number" min="0" max="1" step="0.001" value={formData.dataConfidence} onChange={(e) => updateForm("dataConfidence", e.target.value)} className={inputClass} placeholder="0~1" />
          </div>
          <div className="md:col-span-2 flex gap-2 rounded-lg bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-700">
            <Info size={16} className="mt-0.5 shrink-0" />
            검증 완료로 저장하면 체크리스트, 검토 메모, 관리자, 현재 시각과 변경 필드가 기록됩니다. AI가 남긴 기존 근거는 삭제되지 않습니다.
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-7">
          <button type="button" onClick={handleDelete} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-black text-rose-600 hover:bg-rose-50">
            <Trash2 size={17} /> 완전 삭제
          </button>
          <Button type="submit" disabled={loading} className="h-12 min-w-48 rounded-lg bg-gray-950 px-6 text-sm font-black text-white hover:bg-black disabled:bg-gray-300">
            {loading ? <Loader2 className="animate-spin" size={18} /> : "교정 내용 저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}

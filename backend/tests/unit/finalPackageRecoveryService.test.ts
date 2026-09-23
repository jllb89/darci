import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), apply: vi.fn() }));
vi.mock("../../src/services/billingPolicyService", () => ({ getDocumentReleaseControl: mocks.read, applyFinalPackageBillingPolicy: mocks.apply }));
import { resumePendingFinalPackageRelease } from "../../src/services/finalPackageRecoveryService";
const input={ownerUserId:"owner",documentId:"doc",documentVersionId:"version",documentHashRecordId:"hash",actorUserId:"notary"};
beforeEach(()=>vi.clearAllMocks());
describe("interrupted completed-package billing decision",()=>{
  it("repairs the interrupted workflow before release and fails closed if that repair fails",async()=>{
    mocks.read.mockResolvedValue({release_status:"pending",document_version_id:"version",document_hash_record_id:"hash"});
    const resumeWorkflow=vi.fn().mockRejectedValueOnce(new Error("workflow unavailable")).mockResolvedValue(undefined);
    await expect(resumePendingFinalPackageRelease({...input,resumeWorkflow})).rejects.toThrow("workflow unavailable");expect(mocks.apply).not.toHaveBeenCalled();
    await resumePendingFinalPackageRelease({...input,resumeWorkflow});expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(input);
    mocks.read.mockResolvedValue({release_status:"released"});resumeWorkflow.mockClear();await resumePendingFinalPackageRelease({...input,resumeWorkflow});expect(resumeWorkflow).not.toHaveBeenCalled();
  });
  it.each(["released","billing_held"])("preserves terminal %s state without reevaluating membership",async release_status=>{
    const row={release_status,document_version_id:"version",document_hash_record_id:"hash"};mocks.read.mockResolvedValue(row);
    expect(await resumePendingFinalPackageRelease(input)).toBe(row);expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("resumes exactly the pending version/hash through the real policy boundary",async()=>{
    mocks.read.mockResolvedValue({release_status:"pending",document_version_id:"version",document_hash_record_id:"hash"});mocks.apply.mockResolvedValue({release_status:"billing_held"});
    expect(await resumePendingFinalPackageRelease(input)).toEqual({release_status:"billing_held"});expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(input);
  });
  it.each([null,{release_status:"pending",document_version_id:"other",document_hash_record_id:"hash"},{release_status:"pending",document_version_id:"version",document_hash_record_id:"other"}])("fails closed on missing or mismatched evidence: %j",async control=>{
    mocks.read.mockResolvedValue(control);await expect(resumePendingFinalPackageRelease(input)).rejects.toThrow();expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("does not swallow a failed release transaction",async()=>{
    mocks.read.mockResolvedValue({release_status:"pending",document_version_id:"version",document_hash_record_id:"hash"});mocks.apply.mockRejectedValue(new Error("transaction failed"));
    await expect(resumePendingFinalPackageRelease(input)).rejects.toThrow("transaction failed");
  });
});

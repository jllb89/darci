import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const supabaseMocks = vi.hoisted(() => ({
  client: {
    from: vi.fn(),
  },
  state: {
    document_access_invites: [] as Record<string, unknown>[],
    invite_recipients: [] as Record<string, unknown>[],
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => supabaseMocks.client),
}));

import { resolveClaimedSignerInviteAccess } from "../../src/services/signerInviteAccessService";

type TableName = keyof typeof supabaseMocks.state;
type Filter =
  | { kind: "eq"; field: string; value: unknown }
  | { kind: "in"; field: string; values: unknown[] };

class FakeSupabaseQueryBuilder {
  private filters: Filter[] = [];

  constructor(private readonly table: TableName) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: "eq", field, value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ kind: "in", field, values });
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const data = supabaseMocks.state[this.table].filter((row) =>
      this.filters.every((filter) => {
        switch (filter.kind) {
          case "eq":
            return row[filter.field] === filter.value;
          case "in":
            return filter.values.includes(row[filter.field]);
        }
      }),
    );

    return { data, error: null };
  }
}

describe("resolveClaimedSignerInviteAccess", () => {
  beforeEach(() => {
    supabaseMocks.state.document_access_invites = [];
    supabaseMocks.state.invite_recipients = [];
    supabaseMocks.client.from.mockImplementation(
      (table: TableName) => new FakeSupabaseQueryBuilder(table),
    );
  });

  it("keeps completed claimed invites readable by the same signer", async () => {
    supabaseMocks.state.document_access_invites = [
      {
        id: "invite-completed",
        document_id: "document-1",
        document_output_signer_id: "signer-1",
        document_party_id: "party-1",
        claimed_user_id: "viewer-1",
        status: "completed",
        party_role_snapshot: "grantor",
        obligation_type_snapshot: "signer",
        output_key_snapshot: "trust_rrr",
        document_key_snapshot: "trust_rrr",
        expires_at: null,
        updated_at: "2026-05-06T22:49:18.748754+00:00",
      },
    ];
    supabaseMocks.state.invite_recipients = [
      {
        invite_id: "invite-completed",
        channel: "email",
        delivery_address: "grantor@example.com",
        is_primary: true,
        created_at: "2026-05-06T22:47:22.352+00:00",
      },
    ];

    const access = await resolveClaimedSignerInviteAccess({
      documentId: "document-1",
      viewerUserId: "viewer-1",
      viewerEmail: "grantor@example.com",
    });

    expect(access).toMatchObject({
      inviteId: "invite-completed",
      documentId: "document-1",
      documentOutputSignerId: "signer-1",
      claimedUserId: "viewer-1",
      recipientEmail: "grantor@example.com",
    });
  });

  it("keeps authenticated claimed invites readable after the email invite expires", async () => {
    supabaseMocks.state.document_access_invites = [
      {
        id: "invite-claimed",
        document_id: "document-2",
        document_output_signer_id: "signer-2",
        document_party_id: "party-2",
        claimed_user_id: "viewer-2",
        status: "claimed",
        party_role_snapshot: "trustor",
        obligation_type_snapshot: "signer",
        output_key_snapshot: "ddpoa",
        document_key_snapshot: "ddpoa",
        expires_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2026-05-06T22:49:18.748754+00:00",
      },
    ];
    supabaseMocks.state.invite_recipients = [
      {
        invite_id: "invite-claimed",
        channel: "email",
        delivery_address: "trustor@example.com",
        is_primary: true,
        created_at: "2026-05-06T22:47:22.352+00:00",
      },
    ];

    const access = await resolveClaimedSignerInviteAccess({
      documentId: "document-2",
      viewerUserId: "viewer-2",
      viewerEmail: "trustor@example.com",
    });

    expect(access).toMatchObject({
      inviteId: "invite-claimed",
      documentId: "document-2",
      documentOutputSignerId: "signer-2",
      claimedUserId: "viewer-2",
      recipientEmail: "trustor@example.com",
    });
  });
});

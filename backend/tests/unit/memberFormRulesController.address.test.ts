import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  buildMemberFormAddressSuggestionsFromGeocodeResults,
  normalizeGooglePlaceAddress,
  autocompleteMemberFormAddressByJurisdiction,
  resolveMemberFormAddressDetailsByJurisdiction,
} from "../../src/controllers/memberFormRulesController.ts";

describe("member form address provider fallback", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const place = {
    place_id: "public-fixture", formatted_address: "1 Main St, Columbus, OH 43215, USA", types: ["street_address"],
    address_components: [
      { long_name: "1", short_name: "1", types: ["street_number"] },
      { long_name: "Main Street", short_name: "Main St", types: ["route"] },
      { long_name: "Columbus", short_name: "Columbus", types: ["locality"] },
      { long_name: "Ohio", short_name: "OH", types: ["administrative_area_level_1"] },
      { long_name: "43215", short_name: "43215", types: ["postal_code"] },
      { long_name: "United States", short_name: "US", types: ["country"] },
    ],
  };
  it.each(["autocomplete", "details"] as const)("uses Geocoding when legacy Places %s is denied", async operation => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "synthetic-server-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce({ok: true, json: async () => ({status: "REQUEST_DENIED"})})
      .mockResolvedValueOnce({ok: true, json: async () => ({status: "OK", results: [place]})});
    vi.stubGlobal("fetch", fetchMock);
    const res = {status: vi.fn().mockReturnThis(), json: vi.fn()} as unknown as Response;
    const req = {user: {id: "fixture"}, params: {jurisdiction: "US-OH"}, body: operation === "autocomplete"
      ? {input: "1 Main St Columbus OH"} : {placeId: place.place_id}} as unknown as Request;
    await (operation === "autocomplete" ? autocompleteMemberFormAddressByJurisdiction : resolveMemberFormAddressDetailsByJurisdiction)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallback = new URL(fetchMock.mock.calls[1][0]);
    expect(fallback.pathname).toBe("/maps/api/geocode/json");
    expect(fallback.searchParams.get(operation === "autocomplete" ? "address" : "place_id"))
      .toBe(operation === "autocomplete" ? req.body.input : place.place_id);
    expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain("synthetic-server-key");
    if (operation === "autocomplete") expect(res.json).toHaveBeenCalledWith(expect.objectContaining({suggestions: [expect.objectContaining({placeId: place.place_id})]}));
    else expect(res.json).toHaveBeenCalledWith(expect.objectContaining({address: expect.objectContaining({stateCode: "OH", country: "US"})}));
  });
});

describe("member form address helpers", () => {
  it("normalizes Google place details into a stable final address string", () => {
    const address = normalizeGooglePlaceAddress({
      formatted_address: "123 Market St Apt 4, San Francisco, CA 94105, USA",
      address_components: [
        { long_name: "123", short_name: "123", types: ["street_number"] },
        { long_name: "Market Street", short_name: "Market St", types: ["route"] },
        { long_name: "Apt 4", short_name: "Apt 4", types: ["subpremise"] },
        { long_name: "San Francisco", short_name: "SF", types: ["locality"] },
        {
          long_name: "San Francisco County",
          short_name: "San Francisco County",
          types: ["administrative_area_level_2"],
        },
        { long_name: "California", short_name: "CA", types: ["administrative_area_level_1"] },
        { long_name: "94105", short_name: "94105", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
    });

    expect(address).toMatchObject({
      line1: "123 Market Street",
      line2: "Apt 4",
      city: "San Francisco",
      county: "San Francisco",
      state: "California",
      stateCode: "CA",
      postalCode: "94105",
      country: "US",
      normalizedAddress: "123 Market Street, Apt 4, San Francisco, CA 94105",
    });
  });

  it("builds US-scoped autocomplete suggestions from geocode results across states", () => {
    const suggestions = buildMemberFormAddressSuggestionsFromGeocodeResults(
      [
        {
          place_id: "ca-place",
          formatted_address: "123 Market St, San Francisco, CA 94105, USA",
          address_components: [
            { long_name: "123", short_name: "123", types: ["street_number"] },
            { long_name: "Market Street", short_name: "Market St", types: ["route"] },
            { long_name: "San Francisco", short_name: "SF", types: ["locality"] },
            { long_name: "California", short_name: "CA", types: ["administrative_area_level_1"] },
            { long_name: "94105", short_name: "94105", types: ["postal_code"] },
            { long_name: "United States", short_name: "US", types: ["country"] },
          ],
        },
        {
          place_id: "oh-place",
          formatted_address: "123 Market St, Columbus, OH 43215, USA",
          address_components: [
            { long_name: "123", short_name: "123", types: ["street_number"] },
            { long_name: "Market Street", short_name: "Market St", types: ["route"] },
            { long_name: "Columbus", short_name: "Columbus", types: ["locality"] },
            { long_name: "Ohio", short_name: "OH", types: ["administrative_area_level_1"] },
            { long_name: "43215", short_name: "43215", types: ["postal_code"] },
            { long_name: "United States", short_name: "US", types: ["country"] },
          ],
        },
        {
          place_id: "ca-non-us-place",
          formatted_address: "123 Market St, Toronto, ON M5E 1C3, Canada",
          address_components: [
            { long_name: "123", short_name: "123", types: ["street_number"] },
            { long_name: "Market Street", short_name: "Market St", types: ["route"] },
            { long_name: "Toronto", short_name: "Toronto", types: ["locality"] },
            { long_name: "Ontario", short_name: "ON", types: ["administrative_area_level_1"] },
            { long_name: "M5E 1C3", short_name: "M5E 1C3", types: ["postal_code"] },
            { long_name: "Canada", short_name: "CA", types: ["country"] },
          ],
        },
      ],
    );

    expect(suggestions).toEqual([
      {
        placeId: "ca-place",
        description: "123 Market St, San Francisco, CA 94105, USA",
        mainText: "123 Market Street",
        secondaryText: "San Francisco, CA 94105",
        types: [],
      },
      {
        placeId: "oh-place",
        description: "123 Market St, Columbus, OH 43215, USA",
        mainText: "123 Market Street",
        secondaryText: "Columbus, OH 43215",
        types: [],
      },
    ]);
  });
});

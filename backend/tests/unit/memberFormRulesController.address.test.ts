import { describe, expect, it } from "vitest";
import {
  buildMemberFormAddressSuggestionsFromGeocodeResults,
  normalizeGooglePlaceAddress,
  predictionMatchesJurisdictionState,
} from "../../src/controllers/memberFormRulesController.ts";

describe("member form address helpers", () => {
  it("keeps autocomplete predictions scoped to the selected jurisdiction state", () => {
    expect(
      predictionMatchesJurisdictionState(
        {
          description: "123 Market St, San Francisco, CA, USA",
          terms: [
            { value: "123 Market St" },
            { value: "San Francisco" },
            { value: "CA" },
            { value: "USA" },
          ],
        },
        "CA",
      ),
    ).toBe(true);

    expect(
      predictionMatchesJurisdictionState(
        {
          description: "123 Market St, San Francisco, CA, USA",
          terms: [
            { value: "123 Market St" },
            { value: "San Francisco" },
            { value: "CA" },
            { value: "USA" },
          ],
        },
        "OH",
      ),
    ).toBe(false);
  });

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

  it("builds state-scoped autocomplete suggestions from geocode results", () => {
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
      ],
      "CA",
    );

    expect(suggestions).toEqual([
      {
        placeId: "ca-place",
        description: "123 Market St, San Francisco, CA 94105, USA",
        mainText: "123 Market Street",
        secondaryText: "San Francisco, CA 94105",
      },
    ]);
  });
});
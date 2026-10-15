import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseTypedDiscount,
  priceCart,
  PricingError,
  toPaise,
  toRupees,
  type PriceLineInput,
} from "./pricing";

const line = (
  rupees: number,
  quantity = 1,
  discount?: PriceLineInput["discount"],
): PriceLineInput => ({
  unitPrice: toPaise(rupees),
  quantity,
  discount,
});

describe("toPaise / toRupees", () => {
  it("converts rupees exactly, even where floats wobble", () => {
    assert.equal(toPaise(450), 45000);
    assert.equal(toPaise("12.50"), 1250);
    assert.equal(toPaise(1.005), 101); // 1.005 * 100 = 100.49999999999999 as a float
    assert.equal(toPaise(0.1 + 0.2), 30);
    assert.equal(toRupees(1250), 12.5);
  });

  it("refuses something that isn't an amount", () => {
    assert.throws(() => toPaise("abc"), PricingError);
  });
});

describe("parseTypedDiscount", () => {
  it("reads what was typed, and treats junk as no discount", () => {
    assert.deepEqual(parseTypedDiscount("50", "amount"), { type: "amount", paise: 5000 });
    assert.deepEqual(parseTypedDiscount("12.5", "percent"), { type: "percent", percent: 12.5 });
    assert.deepEqual(parseTypedDiscount("250", "percent"), { type: "percent", percent: 100 });
    for (const typed of ["", "  ", "0", "-5", "abc"]) {
      assert.equal(parseTypedDiscount(typed, "amount"), undefined, typed);
    }
  });
});

describe("priceCart", () => {
  it("prices a plain cart", () => {
    const cart = priceCart({ lines: [line(450, 2), line(120)] });
    assert.equal(cart.subtotal, 102000);
    assert.equal(cart.lineDiscounts, 0);
    assert.equal(cart.billDiscount, 0);
    assert.equal(cart.total, 102000);
  });

  it("takes a line discount, as a flat amount or a percentage", () => {
    const cart = priceCart({
      lines: [
        line(100, 1, { type: "amount", paise: 1000 }),
        line(200, 1, { type: "percent", percent: 10 }),
      ],
    });
    assert.deepEqual(
      cart.lines.map((l) => l.lineDiscount),
      [1000, 2000],
    );
    assert.equal(cart.total, 30000 - 3000);
  });

  it("never discounts below zero or above the price", () => {
    const cart = priceCart({
      lines: [
        line(100, 1, { type: "amount", paise: 999999 }),
        line(50, 1, { type: "percent", percent: 500 }),
      ],
    });
    assert.deepEqual(
      cart.lines.map((l) => l.net),
      [0, 0],
    );
    assert.equal(cart.total, 0);
  });

  it("takes the bill discount off what is left after the line discounts", () => {
    const cart = priceCart({
      lines: [line(100, 1, { type: "amount", paise: 2000 }), line(100)],
      billDiscount: { type: "percent", percent: 10 },
    });
    // 20000 - 2000 = 18000 left; 10% of that is 1800.
    assert.equal(cart.billDiscount, 1800);
    assert.equal(cart.total, 16200);
  });

  it("spreads the bill discount so the shares add up to it exactly", () => {
    // Three equal lines and a 1 rupee discount: 34 + 33 + 33 paise, never 33 + 33 + 33.
    const cart = priceCart({
      lines: [line(10), line(10), line(10)],
      billDiscount: { type: "amount", paise: 100 },
    });
    assert.deepEqual(
      cart.lines.map((l) => l.billShare),
      [34, 33, 33],
    );
    assert.equal(
      cart.lines.reduce((sum, l) => sum + l.billShare, 0),
      cart.billDiscount,
    );
  });

  it("keeps every line's figures consistent with the totals the database checks", () => {
    const cart = priceCart({
      lines: [line(99.99, 3, { type: "percent", percent: 7.5 }), line(0.01, 7), line(1234.56, 2)],
      billDiscount: { type: "percent", percent: 12.5 },
    });
    const sum = (pick: (l: (typeof cart.lines)[number]) => number) =>
      cart.lines.reduce((total, l) => total + pick(l), 0);
    assert.equal(
      sum((l) => l.gross),
      cart.subtotal,
    );
    assert.equal(
      sum((l) => l.lineDiscount),
      cart.lineDiscounts,
    );
    assert.equal(
      sum((l) => l.billShare),
      cart.billDiscount,
    );
    assert.equal(
      sum((l) => l.net),
      cart.total,
    );
    // sales.discount_amount = sum of the lines' discount_amount, and total = subtotal - discount.
    assert.equal(cart.total, cart.subtotal - sum((l) => l.discount));
    for (const l of cart.lines) assert.ok(l.net >= 0 && l.billShare <= l.gross - l.lineDiscount);
  });

  it("gives a free line none of the bill discount", () => {
    const cart = priceCart({
      lines: [line(100), line(50, 1, { type: "percent", percent: 100 })],
      billDiscount: { type: "amount", paise: 500 },
    });
    assert.deepEqual(
      cart.lines.map((l) => l.billShare),
      [500, 0],
    );
  });

  it("handles an empty cart and zero quantities", () => {
    assert.equal(priceCart({ lines: [] }).total, 0);
    assert.equal(
      priceCart({ lines: [line(100, 0)], billDiscount: { type: "amount", paise: 100 } }).total,
      0,
    );
  });

  it("is exact on large amounts", () => {
    const cart = priceCart({
      lines: [{ unitPrice: toPaise(99_999_999.99), quantity: 99 }],
      billDiscount: { type: "percent", percent: 33.33 },
    });
    // 9,899,999,999.01 rupees x 33.33% - far past where float arithmetic stays whole.
    assert.equal(cart.subtotal, 989_999_999_901);
    assert.equal(cart.billDiscount, 329_966_999_967); // half-up of 329,966,999,966.6733
    assert.equal(cart.total, cart.subtotal - cart.billDiscount);
  });

  it("rejects input an honest till would never send", () => {
    assert.throws(() => priceCart({ lines: [{ unitPrice: -1, quantity: 1 }] }), PricingError);
    assert.throws(() => priceCart({ lines: [{ unitPrice: 10.5, quantity: 1 }] }), PricingError);
    assert.throws(() => priceCart({ lines: [{ unitPrice: 100, quantity: -1 }] }), PricingError);
    assert.throws(
      () => priceCart({ lines: [{ unitPrice: 100, quantity: Number.NaN }] }),
      PricingError,
    );
  });
});

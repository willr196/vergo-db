-- Which city a quote is for (London or Birmingham). Null on older quotes.
ALTER TABLE "QuoteRequest" ADD COLUMN "city" TEXT;

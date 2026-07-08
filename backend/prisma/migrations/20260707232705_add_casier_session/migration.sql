-- CreateTable
CREATE TABLE "CasierSession" (
    "chatId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "pendingFieldKey" TEXT,
    "doc1Buffer" BYTEA,
    "doc1MimeType" TEXT,
    "doc1FileName" TEXT,
    "doc2Buffer" BYTEA,
    "doc2MimeType" TEXT,
    "doc2FileName" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasierSession_pkey" PRIMARY KEY ("chatId")
);

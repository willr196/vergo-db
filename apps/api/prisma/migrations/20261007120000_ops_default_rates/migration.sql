-- Usual rates, as the old desktop Ops tool kept them: a client's charge rate
-- fills in new bookings, a worker's pay rate fills in when they are booked.
-- Additive only: two nullable columns.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "defaultChargeRate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "defaultPayRate" DECIMAL(10,2);

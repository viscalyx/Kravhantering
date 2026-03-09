/**
 * Seed script for development database.
 *
 * Usage (inside devcontainer):
 *   npm run db:migrate   # apply migrations first
 *   npm run db:seed      # then seed
 *
 * This script uses wrangler's D1 local emulation via the REST API.
 * For simplicity, it outputs SQL statements to be piped into wrangler d1 execute.
 */

/* eslint-disable no-console */

const seedSQL = `
-- ─── Clean stale seed data ───────────────────────────────────────────────────
DELETE FROM requirement_package_items WHERE id IN (1, 2, 3, 4);
DELETE FROM requirement_packages WHERE id IN (1, 2);
DELETE FROM package_responsibility_areas WHERE id IN (1, 2, 3, 4, 5);
DELETE FROM package_implementation_types WHERE id IN (1, 2);
DELETE FROM requirement_version_scenarios WHERE requirement_version_id IN (2, 5, 7, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100);
DELETE FROM requirement_references WHERE id IN (1, 2, 3);
DELETE FROM requirement_versions WHERE id BETWEEN 1 AND 100;
DELETE FROM requirement_versions WHERE id BETWEEN 101 AND 502;
DELETE FROM requirement_scenarios WHERE id IN (1, 2, 3);
DELETE FROM requirements WHERE id BETWEEN 1 AND 367;
DELETE FROM requirement_areas WHERE id BETWEEN 1 AND 10;
DELETE FROM requirement_type_categories WHERE id BETWEEN 1 AND 48;
DELETE FROM requirement_types WHERE id IN (1, 2);
DELETE FROM requirement_categories WHERE id IN (1, 2, 3);
DELETE FROM requirement_status_transitions WHERE id BETWEEN 1 AND 10;
DELETE FROM requirement_statuses WHERE id BETWEEN 1 AND 10;

-- ─── Requirement Statuses ────────────────────────────────────────────────────
-- 1=Utkast, 2=Granskning, 3=Publicerad, 4=Arkiverad
INSERT OR IGNORE INTO requirement_statuses (id, name_sv, name_en, sort_order, color, is_system) VALUES
  (1, 'Utkast',      'Draft',     1, '#3b82f6', 1),
  (2, 'Granskning',  'Review',    2, '#eab308', 1),
  (3, 'Publicerad',  'Published', 3, '#22c55e', 1),
  (4, 'Arkiverad',   'Archived',  4, '#6b7280', 1);

UPDATE requirement_statuses SET name_sv = 'Utkast',     name_en = 'Draft',     sort_order = 1, color = '#3b82f6', is_system = 1 WHERE id = 1;
UPDATE requirement_statuses SET name_sv = 'Granskning', name_en = 'Review',    sort_order = 2, color = '#eab308', is_system = 1 WHERE id = 2;
UPDATE requirement_statuses SET name_sv = 'Publicerad', name_en = 'Published', sort_order = 3, color = '#22c55e', is_system = 1 WHERE id = 3;
UPDATE requirement_statuses SET name_sv = 'Arkiverad',  name_en = 'Archived',  sort_order = 4, color = '#6b7280', is_system = 1 WHERE id = 4;

-- ─── Requirement Status Transitions ──────────────────────────────────────────
INSERT OR IGNORE INTO requirement_status_transitions (id, from_requirement_status_id, to_requirement_status_id) VALUES
  (1, 1, 2),  -- Utkast → Granskning
  (2, 2, 3),  -- Granskning → Publicerad
  (3, 2, 1),  -- Granskning → Utkast
  (4, 3, 4);  -- Publicerad → Arkiverad

-- ─── Requirement Categories ──────────────────────────────────────────────────
INSERT OR IGNORE INTO requirement_categories (id, name_sv, name_en) VALUES
  (1, 'Verksamhetskrav', 'Business requirement'),
  (2, 'IT-krav', 'IT requirement'),
  (3, 'Leverantörskrav', 'Supplier requirement');

UPDATE requirement_categories SET name_sv = 'Verksamhetskrav', name_en = 'Business requirement' WHERE id = 1;
UPDATE requirement_categories SET name_sv = 'IT-krav', name_en = 'IT requirement' WHERE id = 2;
UPDATE requirement_categories SET name_sv = 'Leverantörskrav', name_en = 'Supplier requirement' WHERE id = 3;

-- ─── Requirement Types ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO requirement_types (id, name_sv, name_en) VALUES
  (1, 'Funktionellt', 'Functional'),
  (2, 'Icke-funktionellt', 'Non-functional');

UPDATE requirement_types SET name_sv = 'Funktionellt', name_en = 'Functional' WHERE id = 1;
UPDATE requirement_types SET name_sv = 'Icke-funktionellt', name_en = 'Non-functional' WHERE id = 2;

-- ─── Requirement Type Categories (ISO/IEC 25010:2023) ────────────────────────
-- Type 1 = Funktionellt
INSERT OR IGNORE INTO requirement_type_categories (id, name_sv, name_en, requirement_type_id, parent_category_id) VALUES
  -- Functional suitability (top-level)
  (1, 'Funktionell lämplighet', 'Functional suitability', 1, NULL),
  (2, 'Funktionell fullständighet', 'Functional completeness', 1, 1),
  (3, 'Funktionell korrekthet', 'Functional correctness', 1, 1),
  (4, 'Funktionell ändamålsenlighet', 'Functional appropriateness', 1, 1);

-- Type 2 = Icke-funktionellt
INSERT OR IGNORE INTO requirement_type_categories (id, name_sv, name_en, requirement_type_id, parent_category_id) VALUES
  -- Performance efficiency
  (5, 'Prestandaeffektivitet', 'Performance efficiency', 2, NULL),
  (6, 'Tidsbeteende', 'Time behavior', 2, 5),
  (7, 'Resursanvändning', 'Resource utilization', 2, 5),
  (8, 'Kapacitet', 'Capacity', 2, 5),

  -- Compatibility
  (9, 'Kompatibilitet', 'Compatibility', 2, NULL),
  (10, 'Samexistens', 'Co-existence', 2, 9),
  (11, 'Interoperabilitet', 'Interoperability', 2, 9),

  -- Interaction capability (new in 25010:2023)
  (12, 'Interaktionsförmåga', 'Interaction capability', 2, NULL),
  (13, 'Igenkännlighet', 'Appropriateness recognizability', 2, 12),
  (14, 'Inlärningsbarhet', 'Learnability', 2, 12),
  (15, 'Användbarhet', 'Operability', 2, 12),
  (16, 'Skydd mot användarfel', 'User error protection', 2, 12),
  (17, 'Engagemang', 'User engagement', 2, 12),
  (18, 'Inkludering', 'Inclusivity', 2, 12),
  (19, 'Hjälpmedelsanpassning', 'User assistance', 2, 12),
  (20, 'Självbeskrivningsförmåga', 'Self-descriptiveness', 2, 12),

  -- Reliability
  (21, 'Tillförlitlighet', 'Reliability', 2, NULL),
  (22, 'Mognad', 'Maturity', 2, 21),
  (23, 'Tillgänglighet', 'Availability', 2, 21),
  (24, 'Feltolerans', 'Fault tolerance', 2, 21),
  (25, 'Återställningsbarhet', 'Recoverability', 2, 21),

  -- Security
  (26, 'Säkerhet', 'Security', 2, NULL),
  (27, 'Konfidentialitet', 'Confidentiality', 2, 26),
  (28, 'Integritet', 'Integrity', 2, 26),
  (29, 'Oavvislighet', 'Non-repudiation', 2, 26),
  (30, 'Ansvarsskyldighet', 'Accountability', 2, 26),
  (31, 'Äkthet', 'Authenticity', 2, 26),
  (32, 'Motståndskraft', 'Resistance', 2, 26),

  -- Maintainability
  (33, 'Underhållbarhet', 'Maintainability', 2, NULL),
  (34, 'Modularitet', 'Modularity', 2, 33),
  (35, 'Återanvändningsbarhet', 'Reusability', 2, 33),
  (36, 'Analyserbarhet', 'Analyzability', 2, 33),
  (37, 'Ändringsbarhet', 'Modifiability', 2, 33),
  (38, 'Testbarhet', 'Testability', 2, 33),

  -- Flexibility (new in 25010:2023)
  (39, 'Flexibilitet', 'Flexibility', 2, NULL),
  (40, 'Anpassningsbarhet', 'Adaptability', 2, 39),
  (41, 'Skalbarhet', 'Scalability', 2, 39),
  (42, 'Installerbarhet', 'Installability', 2, 39),
  (43, 'Utbytbarhet', 'Replaceability', 2, 39),

  -- Safety (new in 25010:2023)
  (44, 'Driftsäkerhet', 'Safety', 2, NULL),
  (45, 'Operativ begränsning', 'Operational constraint', 2, 44),
  (46, 'Riskidentifiering', 'Risk identification', 2, 44),
  (47, 'Felsäkert beteende', 'Fail safe', 2, 44),
  (48, 'Riskvarning', 'Hazard warning', 2, 44);

-- ─── Requirement Areas ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO requirement_areas (id, prefix, name, description, owner_id, next_sequence, created_at, updated_at) VALUES
  (1,  'INT', 'Integration',   'Krav relaterade till systemintegration och gränssnitt',             'owner-1', 39, datetime('now'), datetime('now')),
  (2,  'SÄK', 'Säkerhet',     'Krav relaterade till informationssäkerhet och åtkomstkontroll',     'owner-2', 41, datetime('now'), datetime('now')),
  (3,  'PRE', 'Prestanda',    'Krav relaterade till systemets prestanda och svarstider',           'owner-1', 38, datetime('now'), datetime('now')),
  (4,  'ANV', 'Användbarhet', 'Krav relaterade till användargränssnitt och användarupplevelse',    'owner-3', 37, datetime('now'), datetime('now')),
  (5,  'LAG', 'Lagring',      'Krav relaterade till datalagring, backup och arkivering',           'owner-1', 38, datetime('now'), datetime('now')),
  (6,  'BEH', 'Behörighet',   'Krav relaterade till behörigheter och åtkomstkontroll',             'owner-2', 37, datetime('now'), datetime('now')),
  (7,  'IDN', 'Identitet',    'Krav relaterade till identitetshantering och autentisering',        'owner-2', 37, datetime('now'), datetime('now')),
  (8,  'LOG', 'Loggning',     'Krav relaterade till loggning, spårbarhet och övervakning',         'owner-1', 38, datetime('now'), datetime('now')),
  (9,  'DRF', 'Drift',        'Krav relaterade till driftsättning, underhåll och operativa rutiner','owner-3', 36, datetime('now'), datetime('now')),
  (10, 'DAT', 'Data',         'Krav relaterade till datahantering, kvalitet och migration',        'owner-1', 36, datetime('now'), datetime('now'));

-- ─── Requirements (62 total) ─────────────────────────────────────────────────
-- Areas: INT(1), SÄK(2), PRE(3), ANV(4), LAG(5), BEH(6), IDN(7), LOG(8), DRF(9), DAT(10)
INSERT OR IGNORE INTO requirements (id, unique_id, requirement_area_id, sequence_number, is_archived, created_at) VALUES
  -- Integration (8 reqs)
  (1,  'INT0001', 1, 1, 0, datetime('now')),
  (2,  'INT0002', 1, 2, 0, datetime('now')),
  (3,  'INT0003', 1, 3, 1, datetime('now')),
  (10, 'INT0004', 1, 4, 0, datetime('now')),
  (11, 'INT0005', 1, 5, 0, datetime('now')),
  (12, 'INT0006', 1, 6, 0, datetime('now')),
  (13, 'INT0007', 1, 7, 0, datetime('now')),
  (14, 'INT0008', 1, 8, 0, datetime('now')),
  -- Säkerhet (9 reqs)
  (4,  'SÄK0001', 2, 1, 0, datetime('now')),
  (5,  'SÄK0002', 2, 2, 0, datetime('now')),
  (8,  'SÄK0003', 2, 3, 1, datetime('now')),
  (15, 'SÄK0004', 2, 4, 0, datetime('now')),
  (16, 'SÄK0005', 2, 5, 0, datetime('now')),
  (17, 'SÄK0006', 2, 6, 0, datetime('now')),
  (18, 'SÄK0007', 2, 7, 0, datetime('now')),
  (19, 'SÄK0008', 2, 8, 0, datetime('now')),
  (20, 'SÄK0009', 2, 9, 0, datetime('now')),
  (67, 'SÄK0010', 2, 10, 0, datetime('now')),
  -- Prestanda (7 reqs)
  (6,  'PRE0001', 3, 1, 0, datetime('now')),
  (9,  'PRE0002', 3, 2, 1, datetime('now')),
  (21, 'PRE0003', 3, 3, 0, datetime('now')),
  (22, 'PRE0004', 3, 4, 0, datetime('now')),
  (23, 'PRE0005', 3, 5, 0, datetime('now')),
  (24, 'PRE0006', 3, 6, 0, datetime('now')),
  (25, 'PRE0007', 3, 7, 0, datetime('now')),
  -- Användbarhet (6 reqs)
  (7,  'ANV0001', 4, 1, 0, datetime('now')),
  (26, 'ANV0002', 4, 2, 0, datetime('now')),
  (27, 'ANV0003', 4, 3, 0, datetime('now')),
  (28, 'ANV0004', 4, 4, 0, datetime('now')),
  (29, 'ANV0005', 4, 5, 0, datetime('now')),
  (30, 'ANV0006', 4, 6, 1, datetime('now')),
  -- Lagring (7 reqs) — req 31 will have 5 versions
  (31, 'LAG0001', 5, 1, 0, datetime('now')),
  (32, 'LAG0002', 5, 2, 0, datetime('now')),
  (33, 'LAG0003', 5, 3, 0, datetime('now')),
  (34, 'LAG0004', 5, 4, 0, datetime('now')),
  (35, 'LAG0005', 5, 5, 0, datetime('now')),
  (36, 'LAG0006', 5, 6, 1, datetime('now')),
  (37, 'LAG0007', 5, 7, 0, datetime('now')),
  -- Behörighet (6 reqs)
  (38, 'BEH0001', 6, 1, 0, datetime('now')),
  (39, 'BEH0002', 6, 2, 0, datetime('now')),
  (40, 'BEH0003', 6, 3, 0, datetime('now')),
  (41, 'BEH0004', 6, 4, 0, datetime('now')),
  (42, 'BEH0005', 6, 5, 0, datetime('now')),
  (43, 'BEH0006', 6, 6, 0, datetime('now')),
  -- Identitet (6 reqs) — req 44 will have 10 versions
  (44, 'IDN0001', 7, 1, 0, datetime('now')),
  (45, 'IDN0002', 7, 2, 0, datetime('now')),
  (46, 'IDN0003', 7, 3, 0, datetime('now')),
  (47, 'IDN0004', 7, 4, 0, datetime('now')),
  (48, 'IDN0005', 7, 5, 0, datetime('now')),
  (49, 'IDN0006', 7, 6, 1, datetime('now')),
  -- Loggning (7 reqs) — req 50 will have 15 versions
  (50, 'LOG0001', 8, 1, 0, datetime('now')),
  (51, 'LOG0002', 8, 2, 0, datetime('now')),
  (52, 'LOG0003', 8, 3, 0, datetime('now')),
  (53, 'LOG0004', 8, 4, 0, datetime('now')),
  (54, 'LOG0005', 8, 5, 0, datetime('now')),
  (55, 'LOG0006', 8, 6, 0, datetime('now')),
  (56, 'LOG0007', 8, 7, 1, datetime('now')),
  -- Drift (5 reqs)
  (57, 'DRF0001', 9, 1, 0, datetime('now')),
  (58, 'DRF0002', 9, 2, 0, datetime('now')),
  (59, 'DRF0003', 9, 3, 0, datetime('now')),
  (60, 'DRF0004', 9, 4, 0, datetime('now')),
  (61, 'DRF0005', 9, 5, 0, datetime('now')),
  -- Data (5 reqs)
  (62, 'DAT0001', 10, 1, 0, datetime('now'));

INSERT OR IGNORE INTO requirements (id, unique_id, requirement_area_id, sequence_number, is_archived, created_at) VALUES
  (63, 'DAT0002', 10, 2, 0, datetime('now')),
  (64, 'DAT0003', 10, 3, 0, datetime('now')),
  (65, 'DAT0004', 10, 4, 0, datetime('now')),
  (66, 'DAT0005', 10, 5, 1, datetime('now'));

-- ─── Requirement Versions ────────────────────────────────────────────────────
-- Format: id, requirement_id, version_number, description, acceptance_criteria,
--         requirement_category_id, requirement_type_id, requirement_type_category_id,
--         requirement_status_id, is_testing_required, created_at, created_by, published_at, archived_at
-- requirement_status_id: 1=Utkast, 2=Granskning, 3=Publicerad, 4=Arkiverad
-- published_at: set only for status 3 & 4; archived_at: set only for status 4
-- Constraint: created_at < published_at < archived_at

-- === Original requirements (IDs 1-11) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (1,  1, 1, 'Systemet ska stödja REST API för datautbyte med externa system [Version 1 testdata]', 'API:et svarar med korrekt JSON-format och statuskod 200 [Version 1 testdata]', 2, 1, 1, 3, 1, datetime('now', '-30 days'), 'seed', datetime('now', '-28 days'), datetime('now', '-27 days'), NULL),
  (2,  1, 2, 'Systemet ska stödja REST API (version 2) för datautbyte med externa system inklusive autentisering via OAuth2 [Version 2 testdata]', 'API:et svarar med korrekt JSON-format, statuskod 200, och kräver giltig OAuth2-token [Version 2 testdata]', 2, 1, 1, 1, 1, datetime('now', '-10 days'), 'seed', datetime('now', '-8 days'), NULL, NULL),
  (3,  2, 1, 'Filimport ska stödja CSV-format med UTF-8-kodning [Version 1 testdata]', 'Importfunktionen hanterar filer med svenska tecken (å, ä, ö) korrekt [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-20 days'), 'seed', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (4,  3, 1, 'FTP-integration för filöverföring (utgått) [Version 1 testdata]', 'FTP-anslutning upprättas och fil överförs [Version 1 testdata]', 2, 1, 1, 4, 0, datetime('now', '-60 days'), 'seed', datetime('now', '-56 days'), datetime('now', '-55 days'), datetime('now', '-45 days')),
  (5,  4, 1, 'Alla API-anrop ska autentiseras med OAuth2 eller API-nycklar [Version 1 testdata]', 'Oautentiserade anrop avvisas med HTTP 401 [Version 1 testdata]', 2, 2, 26, 3, 0, datetime('now', '-25 days'), 'seed', datetime('now', '-23 days'), datetime('now', '-22 days'), NULL),
  (6,  5, 1, 'Personuppgifter ska krypteras vid lagring [Version 1 testdata]', 'Data i databasen är krypterat och kan inte läsas i klartext [Version 1 testdata]', 2, 2, 27, 2, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (7,  6, 1, 'Svarstid för API-anrop ska vara under 500ms vid normal last [Version 1 testdata]', '95:e percentilen av svarstider understiger 500ms [Version 1 testdata]', 2, 2, 6, 3, 0, datetime('now', '-18 days'), 'seed', datetime('now', '-16 days'), datetime('now', '-15 days'), NULL),
  (8,  7, 1, 'Användargränssnittet ska vara responsivt och fungera på mobila enheter [Version 1 testdata]', 'Gränssnittet anpassar sig korrekt för skärmbredder från 320px till 1920px [Version 1 testdata]', 1, 2, 15, 1, 1, datetime('now', '-12 days'), 'seed', datetime('now', '-10 days'), NULL, NULL),
  (9,  4, 2, 'Alla API-anrop ska autentiseras med OAuth2, API-nycklar eller mTLS-certifikat [Version 2 testdata]', 'Oautentiserade anrop avvisas med HTTP 401. mTLS-anslutningar valideras mot internt CA. [Version 2 testdata]', 2, 2, 26, 1, 1, datetime('now', '-5 days'), 'seed', datetime('now', '-3 days'), NULL, NULL),
  (10, 8, 1, 'Lösenord ska ha minst 8 tecken (utgått, ersatt av SSO-krav) [Version 1 testdata]', 'Lösenordspolicy verifieras vid registrering [Version 1 testdata]', 2, 2, 31, 4, 0, datetime('now', '-90 days'), 'seed', datetime('now', '-86 days'), datetime('now', '-85 days'), datetime('now', '-75 days')),
  (11, 9, 1, 'Batchjobb ska köras inom 2 timmar (utgått) [Version 1 testdata]', 'Batchjobb slutförs inom tidsgränsen under normal datamängd [Version 1 testdata]', 2, 2, 6, 4, 0, datetime('now', '-120 days'), 'seed', datetime('now', '-116 days'), datetime('now', '-115 days'), datetime('now', '-100 days'));

-- === New Integration requirements (IDs 12-18) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (12, 10, 1, 'Systemet ska stödja asynkron meddelandehantering via RabbitMQ [Version 1 testdata]', 'Meddelanden tas emot och processas utan dataförlust [Version 1 testdata]', 2, 1, 2, 3, 1, datetime('now', '-22 days'), 'seed', datetime('now', '-20 days'), datetime('now', '-19 days'), NULL),
  (13, 11, 1, 'GraphQL-gränssnitt ska tillhandahållas för frontend-applikationer [Version 1 testdata]', 'GraphQL-schema validerar queries och returnerar korrekt data [Version 1 testdata]', 2, 1, 3, 3, 1, datetime('now', '-19 days'), 'seed', datetime('now', '-17 days'), datetime('now', '-16 days'), NULL),
  (14, 12, 1, 'Webhooks ska kunna konfigureras för händelsenotifiering till externa system [Version 1 testdata]', 'Webhook-anrop levereras inom 5 sekunder efter händelse [Version 1 testdata]', 3, 1, 4, 2, 1, datetime('now', '-8 days'), 'seed', datetime('now', '-6 days'), NULL, NULL),
  (15, 13, 1, 'API-gateway ska hantera rate limiting per klient [Version 1 testdata]', 'Klienter som överskrider gränsen får HTTP 429 [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-14 days'), 'seed', datetime('now', '-12 days'), datetime('now', '-11 days'), NULL),
  (16, 14, 1, 'Systemet ska stödja SOAP-integration för äldre system [Version 1 testdata]', 'WSDL-kontrakt valideras och svar returneras i XML-format [Version 1 testdata]', 3, 1, 2, 1, 0, datetime('now', '-3 days'), 'seed', datetime('now', '-1 days'), NULL, NULL);

-- === New Säkerhet requirements (IDs 17-24) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (17, 15, 1, 'All datatrafik ska krypteras med TLS 1.3 eller högre [Version 1 testdata]', 'Inga anslutningar tillåts med TLS-version lägre än 1.3 [Version 1 testdata]', 2, 2, 27, 3, 1, datetime('now', '-28 days'), 'seed', datetime('now', '-26 days'), datetime('now', '-25 days'), NULL),
  (18, 16, 1, 'Säkerhetssårbarhetsskanning ska genomföras automatiskt vid varje deployment [Version 1 testdata]', 'Inga kritiska sårbarheter (CVSS >= 9.0) tillåts i produktion [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-26 days'), 'seed', datetime('now', '-24 days'), datetime('now', '-23 days'), NULL),
  (19, 17, 1, 'Alla privilegierade operationer ska loggas med oförneklig spårbarhet [Version 1 testdata]', 'Loggposter innehåller tidsstämpel, användare, operation och resultat [Version 1 testdata]', 2, 2, 29, 3, 0, datetime('now', '-24 days'), 'security-admin', datetime('now', '-22 days'), datetime('now', '-21 days'), NULL),
  (20, 18, 1, 'Krypteringsnycklar ska roteras var 90:e dag automatiskt [Version 1 testdata]', 'Nyckelrotation sker utan avbrott i tjänsten [Version 1 testdata]', 2, 2, 27, 2, 1, datetime('now', '-10 days'), 'security-admin', datetime('now', '-8 days'), NULL, NULL),
  (21, 19, 1, 'Systemet ska implementera CSRF-skydd på alla tillståndsförändrande endpoints [Version 1 testdata]', 'Förfrågningar utan giltig CSRF-token avvisas med HTTP 403 [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-21 days'), 'seed', datetime('now', '-19 days'), datetime('now', '-18 days'), NULL),
  (22, 20, 1, 'Alla databastransaktioner ska kunna spåras till enskild användare [Version 1 testdata]', 'Varje databasändring har en audit trail-post med användar-ID [Version 1 testdata]', 1, 2, 30, 1, 0, datetime('now', '-7 days'), 'seed', datetime('now', '-5 days'), NULL, NULL);

-- === SÄK0010 — Long-text requirement for identity & access management ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (101, 67, 1, 'Systemet ska implementera en heltäckande lösning för hantering av digitala identiteter och åtkomsträttigheter som möjliggör centraliserad administration av användarkonton, roller och behörigheter över samtliga anslutna delsystem. Lösningen ska stödja automatiserad provisionering och avprovisionering av konton baserat på händelser i HR-systemet samt integration med extern identitetsleverantör via SCIM-protokollet. [Version 1 testdata]', 'Nya användarkonton skapas automatiskt inom 15 minuter efter registrering i HR-systemet och tilldelas korrekta roller baserat på organisatorisk tillhörighet och befattning. Vid avslutad anställning avaktiveras samtliga konton och behörigheter inom 60 minuter. Systemet ska logga alla provisioneringsåtgärder med fullständig spårbarhet inklusive tidsstämpel, källa och genomförd förändring för revisionsändamål. [Version 1 testdata]', 2, 1, 2, 3, 1, datetime('now', '-13 days'), 'security-admin', datetime('now', '-11 days'), datetime('now', '-10 days'), NULL);

-- === New Prestanda requirements (IDs 23-29) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (23, 21, 1, 'Databasen ska hantera minst 10 000 samtidiga läsoperationer [Version 1 testdata]', 'Lasttester visar stabil prestanda vid 10 000 samtidiga SELECT-frågor [Version 1 testdata]', 2, 2, 8, 3, 1, datetime('now', '-17 days'), 'seed', datetime('now', '-15 days'), datetime('now', '-14 days'), NULL),
  (24, 22, 1, 'Sidladdningstiden ska understiga 2 sekunder för 95% av förfrågningarna [Version 1 testdata]', 'Lighthouse-performance score >= 90 [Version 1 testdata]', 1, 2, 6, 3, 1, datetime('now', '-16 days'), 'seed', datetime('now', '-14 days'), datetime('now', '-13 days'), NULL),
  (25, 23, 1, 'CPU-användning ska inte överstiga 70% vid normal last [Version 1 testdata]', 'Övervakningsdata visar CPU < 70% under dagtid [Version 1 testdata]', 2, 2, 7, 2, 0, datetime('now', '-9 days'), 'seed', datetime('now', '-7 days'), NULL, NULL),
  (26, 24, 1, 'Systemet ska klara av en trafikökning på 300% utan degradering [Version 1 testdata]', 'Auto-scaling triggas och svarstider förblir under 1 sekund [Version 1 testdata]', 2, 2, 8, 3, 1, datetime('now', '-20 days'), 'seed', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (27, 25, 1, 'Cache-invalidering ska ske inom 5 sekunder efter dataändring [Version 1 testdata]', 'Klienter ser uppdaterad data inom 5 sekunder [Version 1 testdata]', 2, 2, 6, 1, 1, datetime('now', '-4 days'), 'seed', datetime('now', '-2 days'), NULL, NULL);

-- === New Användbarhet requirements (IDs 28-33) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (28, 26, 1, 'Systemet ska uppfylla WCAG 2.1 nivå AA för tillgänglighet [Version 1 testdata]', 'Automatiserad tillgänglighetsrevision visar inga AA-överträdelser [Version 1 testdata]', 1, 2, 18, 3, 1, datetime('now', '-23 days'), 'seed', datetime('now', '-21 days'), datetime('now', '-20 days'), NULL),
  (29, 27, 1, 'Felmeddelanden ska vara beskrivande och ge användaren vägledning [Version 1 testdata]', 'Alla felmeddelanden innehåller beskrivning och föreslagna åtgärder [Version 1 testdata]', 1, 2, 16, 3, 0, datetime('now', '-21 days'), 'seed', datetime('now', '-19 days'), datetime('now', '-18 days'), NULL),
  (30, 28, 1, 'Nya användare ska kunna slutföra onboardingen inom 5 minuter [Version 1 testdata]', 'Usability-test visar att 90% av användarna klarar onboarding < 5 min [Version 1 testdata]', 1, 2, 14, 2, 1, datetime('now', '-11 days'), 'seed', datetime('now', '-9 days'), NULL, NULL),
  (31, 29, 1, 'Systemet ska erbjuda kontextuell hjälp och dokumentation in-app [Version 1 testdata]', 'Hjälp-ikoner visas vid alla komplexa formulärfält [Version 1 testdata]', 1, 2, 19, 3, 0, datetime('now', '-18 days'), 'seed', datetime('now', '-16 days'), datetime('now', '-15 days'), NULL),
  (32, 30, 1, 'Gränssnittet ska följa Sveriges myndigheters designmönster (utgått) [Version 1 testdata]', 'Manuell granskning mot designguiden genomförd [Version 1 testdata]', 1, 2, 13, 4, 0, datetime('now', '-60 days'), 'seed', datetime('now', '-56 days'), datetime('now', '-55 days'), datetime('now', '-40 days')),
  (102, 30, 2, 'Gränssnittet ska följa Sveriges myndigheters uppdaterade designmönster [Version 2 testdata]', 'Ny granskning mot aktuell designguide genomförs innan kravet publiceras igen [Version 2 testdata]', 1, 2, 13, 1, 0, datetime('now', '-2 days'), 'seed', datetime('now', '-1 days'), NULL, NULL);

-- === Lagring requirements (IDs 33-39) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (33, 32, 1, 'Backup ska utföras dagligen med minst 30 dagars retention [Version 1 testdata]', 'Återställning från backup genomförs framgångsrikt inom RTO [Version 1 testdata]', 2, 2, 25, 3, 1, datetime('now', '-27 days'), 'seed', datetime('now', '-25 days'), datetime('now', '-24 days'), NULL),
  (34, 33, 1, 'Fillagring ska stödja objekt upp till 5 GB [Version 1 testdata]', 'Uppladdning och nedladdning av 5 GB-fil genomförs utan fel [Version 1 testdata]', 2, 2, 8, 3, 1, datetime('now', '-22 days'), 'seed', datetime('now', '-20 days'), datetime('now', '-19 days'), NULL),
  (35, 34, 1, 'Data ska lagras geografiskt inom EU enligt GDPR [Version 1 testdata]', 'Infrastrukturrapport bekräftar att all data finns i EU-region [Version 1 testdata]', 3, 2, 27, 3, 0, datetime('now', '-30 days'), 'seed', datetime('now', '-28 days'), datetime('now', '-27 days'), NULL),
  (36, 35, 1, 'Systemet ska stödja automatisk dataarkivering efter 2 år [Version 1 testdata]', 'Data äldre än 2 år flyttas automatiskt till arkivlagring [Version 1 testdata]', 2, 1, 4, 2, 0, datetime('now', '-8 days'), 'seed', datetime('now', '-6 days'), NULL, NULL),
  (37, 36, 1, 'Tape backup för långtidsarkivering (utgått) [Version 1 testdata]', 'Tape-media verifieras kvartalsvis [Version 1 testdata]', 3, 2, 25, 4, 0, datetime('now', '-90 days'), 'seed', datetime('now', '-86 days'), datetime('now', '-85 days'), datetime('now', '-70 days')),
  (38, 37, 1, 'Systemet ska stödja versionering av alla lagrade dokument [Version 1 testdata]', 'Tidigare versioner av dokument kan återställas via gränssnittet [Version 1 testdata]', 2, 1, 2, 3, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), datetime('now', '-12 days'), NULL);

-- === Behörighet requirements (IDs 39-44) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (39, 38, 1, 'Rollbaserad åtkomstkontroll (RBAC) ska implementeras för alla resurser [Version 1 testdata]', 'Användare utan korrekt roll får HTTP 403 vid åtkomstförsök [Version 1 testdata]', 2, 1, 2, 3, 1, datetime('now', '-25 days'), 'seed', datetime('now', '-23 days'), datetime('now', '-22 days'), NULL),
  (40, 39, 1, 'Administratörsbehörigheter ska kräva godkännande av två personer [Version 1 testdata]', 'Admin-rollen kan inte tilldelas utan sekundär godkännare [Version 1 testdata]', 1, 1, 3, 3, 1, datetime('now', '-20 days'), 'security-admin', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (41, 40, 1, 'Behörighetsändringar ska träda i kraft inom 60 sekunder [Version 1 testdata]', 'Borttagen behörighet blockerar åtkomst inom 60 sekunder [Version 1 testdata]', 2, 2, 6, 2, 1, datetime('now', '-6 days'), 'seed', datetime('now', '-4 days'), NULL, NULL),
  (42, 41, 1, 'Systemet ska stödja attributbaserad åtkomstkontroll (ABAC) för känslig data [Version 1 testdata]', 'ABAC-policyer utvärderas korrekt baserat på användarattribut [Version 1 testdata]', 2, 1, 4, 1, 1, datetime('now', '-3 days'), 'seed', datetime('now', '-1 days'), NULL, NULL),
  (43, 42, 1, 'Alla behörighetstilldelningar ska loggas i en revisionslogg [Version 1 testdata]', 'Revisionsloggen innehåller vem, vad, när för varje behörighetsändring [Version 1 testdata]', 1, 2, 30, 3, 0, datetime('now', '-19 days'), 'security-admin', datetime('now', '-17 days'), datetime('now', '-16 days'), NULL),
  (44, 43, 1, 'Leverantörsåtkomst ska begränsas med tidsbegränsade tokens [Version 1 testdata]', 'Tokens upphör automatiskt efter konfigurerad tid [Version 1 testdata]', 3, 2, 31, 3, 1, datetime('now', '-17 days'), 'seed', datetime('now', '-15 days'), datetime('now', '-14 days'), NULL);

-- === Identitet requirements (IDs 45-50) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (45, 45, 1, 'Systemet ska stödja federerad inloggning via SAML 2.0 och OIDC [Version 1 testdata]', 'Användare kan logga in via extern IdP utan att skapa lokalt konto [Version 1 testdata]', 2, 1, 2, 3, 1, datetime('now', '-24 days'), 'seed', datetime('now', '-22 days'), datetime('now', '-21 days'), NULL),
  (46, 46, 1, 'Sessioner ska tidsbegränsas till max 8 timmar med möjlighet till förnyelse [Version 1 testdata]', 'Session upphör efter 8 timmar och användaren omdirigeras till inloggning [Version 1 testdata]', 2, 2, 31, 3, 1, datetime('now', '-22 days'), 'seed', datetime('now', '-20 days'), datetime('now', '-19 days'), NULL),
  (47, 47, 1, 'Kontospärr ska aktiveras efter 5 misslyckade inloggningsförsök [Version 1 testdata]', 'Kontot spärras i 30 minuter efter 5 felaktiga lösenord [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-20 days'), 'seed', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (48, 48, 1, 'Systemet ska stödja Single Sign-On (SSO) för alla interna applikationer [Version 1 testdata]', 'Användare loggar in en gång och får tillgång till alla anslutna system [Version 1 testdata]', 1, 1, 4, 2, 1, datetime('now', '-7 days'), 'seed', datetime('now', '-5 days'), NULL, NULL),
  (49, 49, 1, 'Utfasad LDAP-autentisering (ersatt av OIDC) [Version 1 testdata]', 'LDAP-bind lyckas mot katalogserver [Version 1 testdata]', 2, 2, 31, 4, 0, datetime('now', '-100 days'), 'seed', datetime('now', '-96 days'), datetime('now', '-95 days'), datetime('now', '-80 days'));

-- === Loggning requirements (IDs 50-56) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (50, 51, 1, 'Alla systemhändelser ska loggas i strukturerat JSON-format [Version 1 testdata]', 'Logghändelser parsas korrekt av centralt loggsystem [Version 1 testdata]', 2, 2, 36, 3, 0, datetime('now', '-26 days'), 'seed', datetime('now', '-24 days'), datetime('now', '-23 days'), NULL),
  (51, 52, 1, 'Loggdata ska bevaras i minst 12 månader [Version 1 testdata]', 'Loggar äldre än 12 månader finns tillgängliga i arkivet [Version 1 testdata]', 3, 2, 30, 3, 0, datetime('now', '-25 days'), 'seed', datetime('now', '-23 days'), datetime('now', '-22 days'), NULL),
  (52, 53, 1, 'Realtidsövervakning ska implementeras för kritiska tjänster [Version 1 testdata]', 'Larm triggas inom 60 sekunder vid anomali [Version 1 testdata]', 2, 2, 23, 3, 1, datetime('now', '-23 days'), 'seed', datetime('now', '-21 days'), datetime('now', '-20 days'), NULL),
  (53, 54, 1, 'Loggar ska kunna korreleras mellan mikrotjänster via trace-ID [Version 1 testdata]', 'Trace-ID propageras genom alla tjänster i anropskedjan [Version 1 testdata]', 2, 2, 36, 2, 1, datetime('now', '-9 days'), 'seed', datetime('now', '-7 days'), NULL, NULL),
  (54, 55, 1, 'Känslig information i loggar ska maskeras automatiskt [Version 1 testdata]', 'Personnummer, kreditkortsnummer och lösenord maskeras i loggutdata [Version 1 testdata]', 2, 2, 27, 3, 1, datetime('now', '-21 days'), 'security-admin', datetime('now', '-19 days'), datetime('now', '-18 days'), NULL),
  (55, 56, 1, 'Syslog-integration för äldre övervakningssystem (utgått) [Version 1 testdata]', 'Syslog-meddelanden mottas av central server [Version 1 testdata]', 3, 2, 11, 4, 0, datetime('now', '-80 days'), 'seed', datetime('now', '-76 days'), datetime('now', '-75 days'), datetime('now', '-60 days'));

-- === Drift requirements (IDs 56-60) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (56, 57, 1, 'Driftsättning ska kunna genomföras utan avbrott (zero-downtime deployment) [Version 1 testdata]', 'Deployment genomförs utan HTTP 5xx-fel under processen [Version 1 testdata]', 2, 2, 23, 3, 1, datetime('now', '-24 days'), 'seed', datetime('now', '-22 days'), datetime('now', '-21 days'), NULL),
  (57, 58, 1, 'Systemet ska stödja automatisk rollback vid misslyckad deployment [Version 1 testdata]', 'Rollback triggas automatiskt om health check misslyckas [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-20 days'), 'seed', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (58, 59, 1, 'Infrastruktur ska definieras som kod (IaC) med versionskontroll [Version 1 testdata]', 'All infrastruktur kan återskapas från Git-repo [Version 1 testdata]', 3, 2, 37, 3, 0, datetime('now', '-19 days'), 'devops-lead', datetime('now', '-17 days'), datetime('now', '-16 days'), NULL),
  (59, 60, 1, 'Systemet ska stödja horisontell skalning av applikationslager [Version 1 testdata]', 'Applikationen skalas till minst 10 instanser utan konfigurationsändringar [Version 1 testdata]', 2, 2, 41, 2, 1, datetime('now', '-5 days'), 'seed', datetime('now', '-3 days'), NULL, NULL),
  (60, 61, 1, 'Systemplattformen ska stödja containerbaserad driftsättning med Kubernetes [Version 1 testdata]', 'Samtliga tjänster körs i Kubernetes-kluster med definierade resource limits [Version 1 testdata]', 3, 2, 42, 1, 0, datetime('now', '-2 days'), 'devops-lead', datetime('now', '-0 days'), NULL, NULL);

-- === Data requirements (IDs 61-65) ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (61, 62, 1, 'Datamigrering ska kunna genomföras utan dataförlust [Version 1 testdata]', 'Verifiering visar 100% dataintegritet efter migrering [Version 1 testdata]', 2, 1, 3, 3, 1, datetime('now', '-22 days'), 'seed', datetime('now', '-20 days'), datetime('now', '-19 days'), NULL),
  (62, 63, 1, 'Systemet ska stödja datakvalitetsvalidering vid import [Version 1 testdata]', 'Felaktig data avvisas med detaljerad felrapport [Version 1 testdata]', 2, 1, 3, 3, 1, datetime('now', '-20 days'), 'seed', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (63, 64, 1, 'Personuppgifter ska kunna raderas helt enligt rätten att bli glömd [Version 1 testdata]', 'Efter radering finns inga spår av personuppgifterna i systemet [Version 1 testdata]', 1, 1, 2, 3, 1, datetime('now', '-19 days'), 'seed', datetime('now', '-17 days'), datetime('now', '-16 days'), NULL),
  (64, 65, 1, 'Systemet ska tillhandahålla API för dataexport i öppna format (JSON, CSV) [Version 1 testdata]', 'Export-API returnerar data i begärt format med korrekt teckenkodning [Version 1 testdata]', 2, 1, 4, 2, 0, datetime('now', '-8 days'), 'seed', datetime('now', '-6 days'), NULL, NULL),
  (65, 66, 1, 'Historisk datamigration från legacy-system (avslutad) [Version 1 testdata]', 'Migrering genomförd och verifierad [Version 1 testdata]', 2, 1, 3, 4, 0, datetime('now', '-70 days'), 'seed', datetime('now', '-66 days'), datetime('now', '-65 days'), datetime('now', '-50 days'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 4: Multi-version requirements
-- ═══════════════════════════════════════════════════════════════════════════════

-- === LAG0001 (req 31) — 5 versions: Storage backup policy evolution ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (66, 31, 1, 'Backup ska utföras veckovis med 7 dagars retention [Version 1 testdata]', 'Veckobackup verifierad genom återställningstest [Version 1 testdata]', 2, 2, 25, 4, 1, datetime('now', '-180 days'), 'storage-admin', datetime('now', '-176 days'), datetime('now', '-175 days'), datetime('now', '-145 days')),
  (67, 31, 2, 'Backup ska utföras dagligen med 14 dagars retention [Version 2 testdata]', 'Daglig backup verifieras automatiskt, retention 14 dagar bekräftad [Version 2 testdata]', 2, 2, 25, 4, 1, datetime('now', '-140 days'), 'storage-admin', datetime('now', '-136 days'), datetime('now', '-135 days'), datetime('now', '-95 days')),
  (68, 31, 3, 'Backup ska utföras dagligen med 30 dagars retention och replikering till sekundär site [Version 3 testdata]', 'Backup replikeras inom 1 timme till DR-site [Version 3 testdata]', 2, 2, 25, 4, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-86 days'), datetime('now', '-85 days'), datetime('now', '-50 days')),
  (69, 31, 4, 'Backup ska utföras dagligen med 30 dagars retention, replikering till sekundär site, och kryptering i vila [Version 4 testdata]', 'Alla backuper krypterade med AES-256, replikering < 1 timme [Version 4 testdata]', 2, 2, 25, 3, 1, datetime('now', '-45 days'), 'devops-lead', datetime('now', '-41 days'), datetime('now', '-40 days'), NULL),
  (70, 31, 5, 'Backup ska utföras dagligen med 90 dagars retention, geo-redundant replikering och kryptering. Point-in-time recovery ska stödjas. [Version 5 testdata]', 'PITR inom 15 minuters granularitet, geo-redundant replikering verifierad [Version 5 testdata]', 2, 2, 25, 1, 1, datetime('now', '-3 days'), 'storage-admin', datetime('now', '-1 days'), NULL, NULL);

-- === IDN0001 (req 44) — 10 versions: Authentication requirement evolution ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (71, 44, 1, 'Användare ska autentiseras med användarnamn och lösenord [Version 1 testdata]', 'Inloggning med korrekta uppgifter ger åtkomst, felaktiga avvisas [Version 1 testdata]', 2, 2, 31, 4, 1, datetime('now', '-365 days'), 'seed', datetime('now', '-361 days'), datetime('now', '-360 days'), datetime('now', '-305 days')),
  (72, 44, 2, 'Lösenord ska ha minst 8 tecken med krav på siffror och bokstäver [Version 2 testdata]', 'Lösenordspolicyn valideras vid registrering och ändring [Version 2 testdata]', 2, 2, 31, 4, 1, datetime('now', '-300 days'), 'seed', datetime('now', '-296 days'), datetime('now', '-295 days'), datetime('now', '-255 days')),
  (73, 44, 3, 'Tvåfaktorsautentisering (2FA) ska erbjudas som tillval via SMS [Version 3 testdata]', '2FA-kod via SMS valideras vid inloggning [Version 3 testdata]', 2, 2, 31, 4, 1, datetime('now', '-250 days'), 'security-admin', datetime('now', '-246 days'), datetime('now', '-245 days'), datetime('now', '-205 days')),
  (74, 44, 4, 'Tvåfaktorsautentisering ska vara obligatorisk för administratörer [Version 4 testdata]', 'Admin-konton utan 2FA kan inte logga in [Version 4 testdata]', 2, 2, 31, 4, 1, datetime('now', '-200 days'), 'security-admin', datetime('now', '-196 days'), datetime('now', '-195 days'), datetime('now', '-165 days')),
  (75, 44, 5, '2FA ska stödja TOTP-appar (Google Authenticator, Microsoft Authenticator) utöver SMS [Version 5 testdata]', 'TOTP-baserad 2FA fungerar korrekt med båda apparna [Version 5 testdata]', 2, 2, 31, 4, 1, datetime('now', '-160 days'), 'security-admin', datetime('now', '-156 days'), datetime('now', '-155 days'), datetime('now', '-125 days')),
  (76, 44, 6, 'Systemet ska stödja SSO via SAML 2.0 för enterprise-kunder [Version 6 testdata]', 'SAML-baserad inloggning fungerar med Azure AD och ADFS [Version 6 testdata]', 2, 1, 2, 4, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-116 days'), datetime('now', '-115 days'), datetime('now', '-85 days')),
  (77, 44, 7, 'OpenID Connect (OIDC) ska stödjas som primär autentiseringsmetod [Version 7 testdata]', 'OIDC-flöde med authorization code + PKCE fungerar korrekt [Version 7 testdata]', 2, 1, 2, 4, 1, datetime('now', '-80 days'), 'seed', datetime('now', '-76 days'), datetime('now', '-75 days'), datetime('now', '-45 days')),
  (78, 44, 8, 'Passwordless-autentisering via WebAuthn/FIDO2 ska stödjas [Version 8 testdata]', 'Användare kan registrera och logga in med biometrisk nyckel [Version 8 testdata]', 2, 2, 31, 4, 1, datetime('now', '-40 days'), 'security-admin', datetime('now', '-36 days'), datetime('now', '-35 days'), datetime('now', '-20 days')),
  (79, 44, 9, 'Passkeys ska stödjas som primär inloggningsmetod med fallback till OIDC [Version 9 testdata]', 'Passkey-registrering och inloggning fungerar i Chrome, Safari och Edge [Version 9 testdata]', 2, 2, 31, 3, 1, datetime('now', '-15 days'), 'security-admin', datetime('now', '-13 days'), datetime('now', '-12 days'), NULL),
  (80, 44, 10, 'Riskbaserad autentisering ska implementeras — step-up auth vid ovanliga inloggningsförsök [Version 10 testdata]', 'Step-up auth triggas vid ny enhet, nytt land, eller avvikande tid [Version 10 testdata]', 2, 2, 31, 1, 1, datetime('now', '-2 days'), 'security-admin', datetime('now', '-0 days'), NULL, NULL);

-- === LOG0001 (req 50) — 15 versions: Central logging requirement evolution ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (81,  50, 1,  'Applikationsloggar ska skrivas till lokal fil [Version 1 testdata]', 'Loggfil skapas och innehåller applikationshändelser [Version 1 testdata]', 2, 2, 36, 4, 0, datetime('now', '-540 days'), 'seed', datetime('now', '-536 days'), datetime('now', '-535 days'), datetime('now', '-505 days')),
  (82,  50, 2,  'Loggar ska ha tre nivåer: ERROR, WARN, INFO [Version 2 testdata]', 'Logghändelser filtreras korrekt baserat på nivå [Version 2 testdata]', 2, 2, 36, 4, 0, datetime('now', '-500 days'), 'seed', datetime('now', '-496 days'), datetime('now', '-495 days'), datetime('now', '-465 days')),
  (83,  50, 3,  'Strukturerat loggformat (JSON) ska användas [Version 3 testdata]', 'Loggar parsas korrekt som JSON [Version 3 testdata]', 2, 2, 36, 4, 0, datetime('now', '-460 days'), 'devops-lead', datetime('now', '-456 days'), datetime('now', '-455 days'), datetime('now', '-425 days')),
  (84,  50, 4,  'Loggar ska skickas till centralt loggsystem (ELK-stack) [Version 4 testdata]', 'Loggar syns i Kibana inom 30 sekunder efter händelse [Version 4 testdata]', 2, 2, 36, 4, 0, datetime('now', '-420 days'), 'devops-lead', datetime('now', '-416 days'), datetime('now', '-415 days'), datetime('now', '-385 days')),
  (85,  50, 5,  'Loggning ska inkludera correlation-ID för spårning mellan tjänster [Version 5 testdata]', 'Correlation-ID propageras genom hela anropskedjan [Version 5 testdata]', 2, 2, 36, 4, 1, datetime('now', '-380 days'), 'devops-lead', datetime('now', '-376 days'), datetime('now', '-375 days'), datetime('now', '-345 days')),
  (86,  50, 6,  'Personuppgifter i loggar ska maskeras automatiskt [Version 6 testdata]', 'PII-data (personnummer, e-post) ersätts med hash i loggutdata [Version 6 testdata]', 2, 2, 27, 4, 1, datetime('now', '-340 days'), 'security-admin', datetime('now', '-336 days'), datetime('now', '-335 days'), datetime('now', '-305 days')),
  (87,  50, 7,  'Loggretention: 90 dagar online, 12 månader i arkiv [Version 7 testdata]', 'Äldre loggar arkiveras automatiskt efter 90 dagar [Version 7 testdata]', 2, 2, 30, 4, 0, datetime('now', '-300 days'), 'devops-lead', datetime('now', '-296 days'), datetime('now', '-295 days'), datetime('now', '-265 days')),
  (88,  50, 8,  'Realtidslarm ska triggas vid kritiska loggmönster (error rate > 5%) [Version 8 testdata]', 'Larm skickas till Slack och PagerDuty inom 60 sekunder [Version 8 testdata]', 2, 2, 23, 4, 1, datetime('now', '-260 days'), 'devops-lead', datetime('now', '-256 days'), datetime('now', '-255 days'), datetime('now', '-225 days')),
  (89,  50, 9,  'Loggar ska signeras kryptografiskt för att förhindra manipulation [Version 9 testdata]', 'Signaturverifiering detekterar modifierade loggar [Version 9 testdata]', 2, 2, 28, 4, 1, datetime('now', '-220 days'), 'security-admin', datetime('now', '-216 days'), datetime('now', '-215 days'), datetime('now', '-185 days')),
  (90,  50, 10, 'OpenTelemetry ska användas som standard för distribuerad spårning [Version 10 testdata]', 'OTel-traces exporteras korrekt till Jaeger/Tempo [Version 10 testdata]', 2, 2, 36, 4, 1, datetime('now', '-180 days'), 'devops-lead', datetime('now', '-176 days'), datetime('now', '-175 days'), datetime('now', '-145 days')),
  (91,  50, 11, 'Dashboards för logganalys ska erbjudas per tjänst och team [Version 11 testdata]', 'Varje team har en dedikerad Grafana-dashboard med relevanta paneler [Version 11 testdata]', 1, 2, 20, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-136 days'), datetime('now', '-135 days'), datetime('now', '-105 days')),
  (92,  50, 12, 'Anomalidetektering baserad på maskininlärning ska implementeras [Version 12 testdata]', 'ML-modell detekterar avvikande loggmönster med < 5% false positive rate [Version 12 testdata]', 2, 2, 22, 4, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-96 days'), datetime('now', '-95 days'), datetime('now', '-65 days')),
  (93,  50, 13, 'Loggning ska stödja multi-tenant isolation — loggar får inte läcka mellan kunder [Version 13 testdata]', 'Tenant-filter appliceras på alla loggfrågor, cross-tenant access blockeras [Version 13 testdata]', 2, 2, 27, 4, 1, datetime('now', '-60 days'), 'security-admin', datetime('now', '-56 days'), datetime('now', '-55 days'), datetime('now', '-25 days')),
  (94,  50, 14, 'Compliance-rapportering: automatisk generering av audit-rapporter från loggar [Version 14 testdata]', 'Månadsvis audit-rapport genereras automatiskt och skickas till compliance-team [Version 14 testdata]', 1, 2, 30, 3, 0, datetime('now', '-20 days'), 'security-admin', datetime('now', '-18 days'), datetime('now', '-17 days'), NULL),
  (95,  50, 15, 'Centralt loggsystem ska migrera från ELK till Grafana Loki med OpenTelemetry Collector [Version 15 testdata]', 'Alla tjänster loggar via OTel Collector till Loki, Kibana-dashboards migrerade till Grafana [Version 15 testdata]', 2, 2, 37, 1, 1, datetime('now', '-1 days'), 'devops-lead', datetime('now', '-0 days'), NULL, NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 5: 300 additional IT-related requirements (IDs 68-367)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── New Requirements (300 total) ────────────────────────────────────────────
INSERT OR IGNORE INTO requirements (id, unique_id, requirement_area_id, sequence_number, is_archived, created_at) VALUES
  -- Integration (30 new reqs)
  (68, 'INT0009', 1, 9, 0, datetime('now')),
  (69, 'INT0010', 1, 10, 0, datetime('now')),
  (70, 'INT0011', 1, 11, 0, datetime('now')),
  (71, 'INT0012', 1, 12, 0, datetime('now')),
  (72, 'INT0013', 1, 13, 0, datetime('now')),
  (73, 'INT0014', 1, 14, 0, datetime('now')),
  (74, 'INT0015', 1, 15, 0, datetime('now')),
  (75, 'INT0016', 1, 16, 0, datetime('now')),
  (76, 'INT0017', 1, 17, 0, datetime('now')),
  (77, 'INT0018', 1, 18, 0, datetime('now')),
  (78, 'INT0019', 1, 19, 0, datetime('now')),
  (79, 'INT0020', 1, 20, 0, datetime('now')),
  (80, 'INT0021', 1, 21, 1, datetime('now')),
  (81, 'INT0022', 1, 22, 0, datetime('now')),
  (82, 'INT0023', 1, 23, 0, datetime('now')),
  (83, 'INT0024', 1, 24, 0, datetime('now')),
  (84, 'INT0025', 1, 25, 0, datetime('now')),
  (85, 'INT0026', 1, 26, 0, datetime('now')),
  (86, 'INT0027', 1, 27, 0, datetime('now')),
  (87, 'INT0028', 1, 28, 0, datetime('now')),
  (88, 'INT0029', 1, 29, 0, datetime('now')),
  (89, 'INT0030', 1, 30, 0, datetime('now')),
  (90, 'INT0031', 1, 31, 0, datetime('now')),
  (91, 'INT0032', 1, 32, 0, datetime('now')),
  (92, 'INT0033', 1, 33, 0, datetime('now')),
  (93, 'INT0034', 1, 34, 0, datetime('now')),
  (94, 'INT0035', 1, 35, 0, datetime('now')),
  (95, 'INT0036', 1, 36, 0, datetime('now')),
  (96, 'INT0037', 1, 37, 0, datetime('now')),
  (97, 'INT0038', 1, 38, 0, datetime('now')),
  -- Säkerhet (30 new reqs)
  (98, 'SÄK0011', 2, 11, 0, datetime('now')),
  (99, 'SÄK0012', 2, 12, 0, datetime('now')),
  (100, 'SÄK0013', 2, 13, 0, datetime('now')),
  (101, 'SÄK0014', 2, 14, 0, datetime('now')),
  (102, 'SÄK0015', 2, 15, 0, datetime('now')),
  (103, 'SÄK0016', 2, 16, 0, datetime('now')),
  (104, 'SÄK0017', 2, 17, 0, datetime('now')),
  (105, 'SÄK0018', 2, 18, 0, datetime('now')),
  (106, 'SÄK0019', 2, 19, 0, datetime('now')),
  (107, 'SÄK0020', 2, 20, 0, datetime('now')),
  (108, 'SÄK0021', 2, 21, 0, datetime('now')),
  (109, 'SÄK0022', 2, 22, 0, datetime('now')),
  (110, 'SÄK0023', 2, 23, 1, datetime('now')),
  (111, 'SÄK0024', 2, 24, 0, datetime('now')),
  (112, 'SÄK0025', 2, 25, 0, datetime('now')),
  (113, 'SÄK0026', 2, 26, 0, datetime('now')),
  (114, 'SÄK0027', 2, 27, 0, datetime('now')),
  (115, 'SÄK0028', 2, 28, 0, datetime('now')),
  (116, 'SÄK0029', 2, 29, 0, datetime('now')),
  (117, 'SÄK0030', 2, 30, 0, datetime('now')),
  (118, 'SÄK0031', 2, 31, 0, datetime('now')),
  (119, 'SÄK0032', 2, 32, 0, datetime('now')),
  (120, 'SÄK0033', 2, 33, 0, datetime('now')),
  (121, 'SÄK0034', 2, 34, 0, datetime('now')),
  (122, 'SÄK0035', 2, 35, 0, datetime('now')),
  (123, 'SÄK0036', 2, 36, 0, datetime('now')),
  (124, 'SÄK0037', 2, 37, 0, datetime('now')),
  (125, 'SÄK0038', 2, 38, 0, datetime('now')),
  (126, 'SÄK0039', 2, 39, 0, datetime('now')),
  (127, 'SÄK0040', 2, 40, 0, datetime('now')),
  -- Prestanda (30 new reqs)
  (128, 'PRE0008', 3, 8, 0, datetime('now')),
  (129, 'PRE0009', 3, 9, 0, datetime('now')),
  (130, 'PRE0010', 3, 10, 0, datetime('now')),
  (131, 'PRE0011', 3, 11, 0, datetime('now')),
  (132, 'PRE0012', 3, 12, 0, datetime('now')),
  (133, 'PRE0013', 3, 13, 0, datetime('now')),
  (134, 'PRE0014', 3, 14, 0, datetime('now')),
  (135, 'PRE0015', 3, 15, 0, datetime('now')),
  (136, 'PRE0016', 3, 16, 0, datetime('now')),
  (137, 'PRE0017', 3, 17, 0, datetime('now')),
  (138, 'PRE0018', 3, 18, 0, datetime('now')),
  (139, 'PRE0019', 3, 19, 0, datetime('now')),
  (140, 'PRE0020', 3, 20, 1, datetime('now')),
  (141, 'PRE0021', 3, 21, 0, datetime('now')),
  (142, 'PRE0022', 3, 22, 0, datetime('now')),
  (143, 'PRE0023', 3, 23, 0, datetime('now')),
  (144, 'PRE0024', 3, 24, 0, datetime('now')),
  (145, 'PRE0025', 3, 25, 0, datetime('now')),
  (146, 'PRE0026', 3, 26, 0, datetime('now')),
  (147, 'PRE0027', 3, 27, 0, datetime('now')),
  (148, 'PRE0028', 3, 28, 0, datetime('now')),
  (149, 'PRE0029', 3, 29, 0, datetime('now')),
  (150, 'PRE0030', 3, 30, 0, datetime('now')),
  (151, 'PRE0031', 3, 31, 0, datetime('now')),
  (152, 'PRE0032', 3, 32, 0, datetime('now')),
  (153, 'PRE0033', 3, 33, 0, datetime('now')),
  (154, 'PRE0034', 3, 34, 0, datetime('now')),
  (155, 'PRE0035', 3, 35, 0, datetime('now')),
  (156, 'PRE0036', 3, 36, 0, datetime('now')),
  (157, 'PRE0037', 3, 37, 0, datetime('now')),
  -- Användbarhet (30 new reqs)
  (158, 'ANV0007', 4, 7, 0, datetime('now')),
  (159, 'ANV0008', 4, 8, 0, datetime('now')),
  (160, 'ANV0009', 4, 9, 0, datetime('now')),
  (161, 'ANV0010', 4, 10, 0, datetime('now')),
  (162, 'ANV0011', 4, 11, 0, datetime('now')),
  (163, 'ANV0012', 4, 12, 0, datetime('now')),
  (164, 'ANV0013', 4, 13, 0, datetime('now')),
  (165, 'ANV0014', 4, 14, 0, datetime('now')),
  (166, 'ANV0015', 4, 15, 0, datetime('now')),
  (167, 'ANV0016', 4, 16, 0, datetime('now')),
  (168, 'ANV0017', 4, 17, 0, datetime('now')),
  (169, 'ANV0018', 4, 18, 0, datetime('now')),
  (170, 'ANV0019', 4, 19, 1, datetime('now')),
  (171, 'ANV0020', 4, 20, 0, datetime('now')),
  (172, 'ANV0021', 4, 21, 0, datetime('now')),
  (173, 'ANV0022', 4, 22, 0, datetime('now')),
  (174, 'ANV0023', 4, 23, 0, datetime('now')),
  (175, 'ANV0024', 4, 24, 0, datetime('now')),
  (176, 'ANV0025', 4, 25, 0, datetime('now')),
  (177, 'ANV0026', 4, 26, 0, datetime('now')),
  (178, 'ANV0027', 4, 27, 0, datetime('now')),
  (179, 'ANV0028', 4, 28, 0, datetime('now')),
  (180, 'ANV0029', 4, 29, 0, datetime('now')),
  (181, 'ANV0030', 4, 30, 0, datetime('now')),
  (182, 'ANV0031', 4, 31, 0, datetime('now')),
  (183, 'ANV0032', 4, 32, 0, datetime('now')),
  (184, 'ANV0033', 4, 33, 0, datetime('now')),
  (185, 'ANV0034', 4, 34, 0, datetime('now')),
  (186, 'ANV0035', 4, 35, 0, datetime('now')),
  (187, 'ANV0036', 4, 36, 0, datetime('now')),
  -- Lagring (30 new reqs)
  (188, 'LAG0008', 5, 8, 0, datetime('now')),
  (189, 'LAG0009', 5, 9, 0, datetime('now')),
  (190, 'LAG0010', 5, 10, 0, datetime('now')),
  (191, 'LAG0011', 5, 11, 0, datetime('now')),
  (192, 'LAG0012', 5, 12, 0, datetime('now')),
  (193, 'LAG0013', 5, 13, 0, datetime('now')),
  (194, 'LAG0014', 5, 14, 0, datetime('now')),
  (195, 'LAG0015', 5, 15, 0, datetime('now')),
  (196, 'LAG0016', 5, 16, 0, datetime('now')),
  (197, 'LAG0017', 5, 17, 0, datetime('now')),
  (198, 'LAG0018', 5, 18, 0, datetime('now')),
  (199, 'LAG0019', 5, 19, 0, datetime('now')),
  (200, 'LAG0020', 5, 20, 1, datetime('now')),
  (201, 'LAG0021', 5, 21, 0, datetime('now')),
  (202, 'LAG0022', 5, 22, 0, datetime('now')),
  (203, 'LAG0023', 5, 23, 0, datetime('now')),
  (204, 'LAG0024', 5, 24, 0, datetime('now')),
  (205, 'LAG0025', 5, 25, 0, datetime('now')),
  (206, 'LAG0026', 5, 26, 0, datetime('now')),
  (207, 'LAG0027', 5, 27, 0, datetime('now')),
  (208, 'LAG0028', 5, 28, 0, datetime('now')),
  (209, 'LAG0029', 5, 29, 0, datetime('now')),
  (210, 'LAG0030', 5, 30, 0, datetime('now')),
  (211, 'LAG0031', 5, 31, 0, datetime('now')),
  (212, 'LAG0032', 5, 32, 0, datetime('now')),
  (213, 'LAG0033', 5, 33, 0, datetime('now')),
  (214, 'LAG0034', 5, 34, 0, datetime('now')),
  (215, 'LAG0035', 5, 35, 0, datetime('now')),
  (216, 'LAG0036', 5, 36, 0, datetime('now')),
  (217, 'LAG0037', 5, 37, 0, datetime('now')),
  -- Behörighet (30 new reqs)
  (218, 'BEH0007', 6, 7, 0, datetime('now')),
  (219, 'BEH0008', 6, 8, 0, datetime('now')),
  (220, 'BEH0009', 6, 9, 0, datetime('now')),
  (221, 'BEH0010', 6, 10, 0, datetime('now')),
  (222, 'BEH0011', 6, 11, 0, datetime('now')),
  (223, 'BEH0012', 6, 12, 0, datetime('now')),
  (224, 'BEH0013', 6, 13, 0, datetime('now')),
  (225, 'BEH0014', 6, 14, 0, datetime('now')),
  (226, 'BEH0015', 6, 15, 0, datetime('now')),
  (227, 'BEH0016', 6, 16, 0, datetime('now')),
  (228, 'BEH0017', 6, 17, 0, datetime('now')),
  (229, 'BEH0018', 6, 18, 0, datetime('now')),
  (230, 'BEH0019', 6, 19, 1, datetime('now')),
  (231, 'BEH0020', 6, 20, 0, datetime('now')),
  (232, 'BEH0021', 6, 21, 0, datetime('now')),
  (233, 'BEH0022', 6, 22, 0, datetime('now')),
  (234, 'BEH0023', 6, 23, 0, datetime('now')),
  (235, 'BEH0024', 6, 24, 0, datetime('now')),
  (236, 'BEH0025', 6, 25, 0, datetime('now')),
  (237, 'BEH0026', 6, 26, 0, datetime('now')),
  (238, 'BEH0027', 6, 27, 0, datetime('now')),
  (239, 'BEH0028', 6, 28, 0, datetime('now')),
  (240, 'BEH0029', 6, 29, 0, datetime('now')),
  (241, 'BEH0030', 6, 30, 0, datetime('now')),
  (242, 'BEH0031', 6, 31, 0, datetime('now')),
  (243, 'BEH0032', 6, 32, 0, datetime('now')),
  (244, 'BEH0033', 6, 33, 0, datetime('now')),
  (245, 'BEH0034', 6, 34, 0, datetime('now')),
  (246, 'BEH0035', 6, 35, 0, datetime('now')),
  (247, 'BEH0036', 6, 36, 0, datetime('now')),
  -- Identitet (30 new reqs)
  (248, 'IDN0007', 7, 7, 0, datetime('now')),
  (249, 'IDN0008', 7, 8, 0, datetime('now')),
  (250, 'IDN0009', 7, 9, 0, datetime('now')),
  (251, 'IDN0010', 7, 10, 0, datetime('now')),
  (252, 'IDN0011', 7, 11, 0, datetime('now')),
  (253, 'IDN0012', 7, 12, 0, datetime('now')),
  (254, 'IDN0013', 7, 13, 0, datetime('now')),
  (255, 'IDN0014', 7, 14, 0, datetime('now')),
  (256, 'IDN0015', 7, 15, 0, datetime('now')),
  (257, 'IDN0016', 7, 16, 0, datetime('now')),
  (258, 'IDN0017', 7, 17, 0, datetime('now')),
  (259, 'IDN0018', 7, 18, 0, datetime('now')),
  (260, 'IDN0019', 7, 19, 1, datetime('now')),
  (261, 'IDN0020', 7, 20, 0, datetime('now')),
  (262, 'IDN0021', 7, 21, 0, datetime('now')),
  (263, 'IDN0022', 7, 22, 0, datetime('now')),
  (264, 'IDN0023', 7, 23, 0, datetime('now')),
  (265, 'IDN0024', 7, 24, 0, datetime('now')),
  (266, 'IDN0025', 7, 25, 0, datetime('now')),
  (267, 'IDN0026', 7, 26, 0, datetime('now')),
  (268, 'IDN0027', 7, 27, 0, datetime('now')),
  (269, 'IDN0028', 7, 28, 0, datetime('now')),
  (270, 'IDN0029', 7, 29, 0, datetime('now')),
  (271, 'IDN0030', 7, 30, 0, datetime('now')),
  (272, 'IDN0031', 7, 31, 0, datetime('now')),
  (273, 'IDN0032', 7, 32, 0, datetime('now')),
  (274, 'IDN0033', 7, 33, 0, datetime('now')),
  (275, 'IDN0034', 7, 34, 0, datetime('now')),
  (276, 'IDN0035', 7, 35, 0, datetime('now')),
  (277, 'IDN0036', 7, 36, 0, datetime('now')),
  -- Loggning (30 new reqs)
  (278, 'LOG0008', 8, 8, 0, datetime('now')),
  (279, 'LOG0009', 8, 9, 0, datetime('now')),
  (280, 'LOG0010', 8, 10, 0, datetime('now')),
  (281, 'LOG0011', 8, 11, 0, datetime('now')),
  (282, 'LOG0012', 8, 12, 0, datetime('now')),
  (283, 'LOG0013', 8, 13, 0, datetime('now')),
  (284, 'LOG0014', 8, 14, 0, datetime('now')),
  (285, 'LOG0015', 8, 15, 0, datetime('now')),
  (286, 'LOG0016', 8, 16, 0, datetime('now')),
  (287, 'LOG0017', 8, 17, 0, datetime('now')),
  (288, 'LOG0018', 8, 18, 0, datetime('now')),
  (289, 'LOG0019', 8, 19, 0, datetime('now')),
  (290, 'LOG0020', 8, 20, 1, datetime('now')),
  (291, 'LOG0021', 8, 21, 0, datetime('now')),
  (292, 'LOG0022', 8, 22, 0, datetime('now')),
  (293, 'LOG0023', 8, 23, 0, datetime('now')),
  (294, 'LOG0024', 8, 24, 0, datetime('now')),
  (295, 'LOG0025', 8, 25, 0, datetime('now')),
  (296, 'LOG0026', 8, 26, 0, datetime('now')),
  (297, 'LOG0027', 8, 27, 0, datetime('now')),
  (298, 'LOG0028', 8, 28, 0, datetime('now')),
  (299, 'LOG0029', 8, 29, 0, datetime('now')),
  (300, 'LOG0030', 8, 30, 0, datetime('now')),
  (301, 'LOG0031', 8, 31, 0, datetime('now')),
  (302, 'LOG0032', 8, 32, 0, datetime('now')),
  (303, 'LOG0033', 8, 33, 0, datetime('now')),
  (304, 'LOG0034', 8, 34, 0, datetime('now')),
  (305, 'LOG0035', 8, 35, 0, datetime('now')),
  (306, 'LOG0036', 8, 36, 0, datetime('now')),
  (307, 'LOG0037', 8, 37, 0, datetime('now')),
  -- Drift (30 new reqs)
  (308, 'DRF0006', 9, 6, 0, datetime('now')),
  (309, 'DRF0007', 9, 7, 0, datetime('now')),
  (310, 'DRF0008', 9, 8, 0, datetime('now')),
  (311, 'DRF0009', 9, 9, 0, datetime('now')),
  (312, 'DRF0010', 9, 10, 0, datetime('now')),
  (313, 'DRF0011', 9, 11, 0, datetime('now')),
  (314, 'DRF0012', 9, 12, 0, datetime('now')),
  (315, 'DRF0013', 9, 13, 0, datetime('now')),
  (316, 'DRF0014', 9, 14, 0, datetime('now')),
  (317, 'DRF0015', 9, 15, 0, datetime('now')),
  (318, 'DRF0016', 9, 16, 0, datetime('now')),
  (319, 'DRF0017', 9, 17, 0, datetime('now')),
  (320, 'DRF0018', 9, 18, 1, datetime('now')),
  (321, 'DRF0019', 9, 19, 0, datetime('now')),
  (322, 'DRF0020', 9, 20, 0, datetime('now')),
  (323, 'DRF0021', 9, 21, 0, datetime('now')),
  (324, 'DRF0022', 9, 22, 0, datetime('now')),
  (325, 'DRF0023', 9, 23, 0, datetime('now')),
  (326, 'DRF0024', 9, 24, 0, datetime('now')),
  (327, 'DRF0025', 9, 25, 0, datetime('now')),
  (328, 'DRF0026', 9, 26, 0, datetime('now')),
  (329, 'DRF0027', 9, 27, 0, datetime('now')),
  (330, 'DRF0028', 9, 28, 0, datetime('now')),
  (331, 'DRF0029', 9, 29, 0, datetime('now')),
  (332, 'DRF0030', 9, 30, 0, datetime('now')),
  (333, 'DRF0031', 9, 31, 0, datetime('now')),
  (334, 'DRF0032', 9, 32, 0, datetime('now')),
  (335, 'DRF0033', 9, 33, 0, datetime('now')),
  (336, 'DRF0034', 9, 34, 0, datetime('now')),
  (337, 'DRF0035', 9, 35, 0, datetime('now')),
  -- Data (30 new reqs)
  (338, 'DAT0006', 10, 6, 0, datetime('now')),
  (339, 'DAT0007', 10, 7, 0, datetime('now')),
  (340, 'DAT0008', 10, 8, 0, datetime('now')),
  (341, 'DAT0009', 10, 9, 0, datetime('now')),
  (342, 'DAT0010', 10, 10, 0, datetime('now')),
  (343, 'DAT0011', 10, 11, 0, datetime('now')),
  (344, 'DAT0012', 10, 12, 0, datetime('now')),
  (345, 'DAT0013', 10, 13, 0, datetime('now')),
  (346, 'DAT0014', 10, 14, 0, datetime('now')),
  (347, 'DAT0015', 10, 15, 0, datetime('now')),
  (348, 'DAT0016', 10, 16, 0, datetime('now')),
  (349, 'DAT0017', 10, 17, 0, datetime('now')),
  (350, 'DAT0018', 10, 18, 1, datetime('now')),
  (351, 'DAT0019', 10, 19, 0, datetime('now')),
  (352, 'DAT0020', 10, 20, 0, datetime('now')),
  (353, 'DAT0021', 10, 21, 0, datetime('now')),
  (354, 'DAT0022', 10, 22, 0, datetime('now')),
  (355, 'DAT0023', 10, 23, 0, datetime('now')),
  (356, 'DAT0024', 10, 24, 0, datetime('now')),
  (357, 'DAT0025', 10, 25, 0, datetime('now')),
  (358, 'DAT0026', 10, 26, 0, datetime('now')),
  (359, 'DAT0027', 10, 27, 0, datetime('now')),
  (360, 'DAT0028', 10, 28, 0, datetime('now')),
  (361, 'DAT0029', 10, 29, 0, datetime('now')),
  (362, 'DAT0030', 10, 30, 0, datetime('now')),
  (363, 'DAT0031', 10, 31, 0, datetime('now')),
  (364, 'DAT0032', 10, 32, 0, datetime('now')),
  (365, 'DAT0033', 10, 33, 0, datetime('now')),
  (366, 'DAT0034', 10, 34, 0, datetime('now')),
  (367, 'DAT0035', 10, 35, 0, datetime('now'));

-- === New Integration versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (103, 68, 1, 'gRPC-integration för intern mikrotjänstkommunikation [Version 1 testdata]', 'gRPC-anrop mellan tjänster returnerar korrekt data [Version 1 testdata]', 1, 1, 2, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (104, 69, 1, 'Event-driven arkitektur med Apache Kafka [Version 1 testdata]', 'Kafka-meddelanden konsumeras i rätt ordning utan duplicering [Version 1 testdata]', 2, 2, 3, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (105, 70, 1, 'API-versionshantering med semantisk versionering [Version 1 testdata]', 'Bakåtkompatibla API-ändringar bryter inte befintliga klienter [Version 1 testdata]', 2, 2, 4, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (106, 71, 1, 'Service mesh med Istio för tjänstekommunikation [Version 1 testdata]', 'Istio-proxy hanterar trafik korrekt med mTLS [Version 1 testdata]', 2, 1, 11, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (107, 72, 1, 'Batch-integration med SFTP-filöverföring [Version 1 testdata]', 'SFTP-filer hämtas och processas enligt schema [Version 1 testdata]', 2, 2, 34, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (108, 73, 1, 'WebSocket-stöd för realtidskommunikation — initial version [Version 1 testdata]', 'WebSocket-anslutningar hanterar 5000 samtidiga klienter [Version 1 testdata]', 1, 2, 37, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (109, 73, 2, 'WebSocket-stöd för realtidskommunikation — uppdatering v2 [Version 2 testdata]', 'WebSocket-anslutningar hanterar 5000 samtidiga klienter [Version 2 testdata]', 1, 2, 37, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (110, 74, 1, 'EDI-integration med handelspartners — initial version [Version 1 testdata]', 'EDI-meddelanden parsas och skickas i EDIFACT-format [Version 1 testdata]', 2, 1, 2, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (111, 74, 2, 'EDI-integration med handelspartners — uppdatering v2 [Version 2 testdata]', 'EDI-meddelanden parsas och skickas i EDIFACT-format [Version 2 testdata]', 2, 1, 2, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (112, 74, 3, 'EDI-integration med handelspartners — uppdatering v3 [Version 3 testdata]', 'EDI-meddelanden parsas och skickas i EDIFACT-format [Version 3 testdata]', 2, 1, 2, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (113, 75, 1, 'CDC-integration (Change Data Capture) med Debezium [Version 1 testdata]', 'Databasändringar propageras till konsumenter inom 10 sekunder [Version 1 testdata]', 3, 2, 3, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (114, 76, 1, 'iPaaS-integration via MuleSoft för SaaS-tjänster [Version 1 testdata]', 'SaaS-data synkroniseras i realtid via MuleSoft-flöden [Version 1 testdata]', 2, 2, 4, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (115, 77, 1, 'OpenAPI-specifikation ska genereras automatiskt [Version 1 testdata]', 'Swagger-dokumentation uppdateras vid varje build [Version 1 testdata]', 2, 1, 11, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (116, 78, 1, 'Message queue dead-letter-hantering — initial version [Version 1 testdata]', 'Meddelanden som misslyckas 3 gånger flyttas till DLQ [Version 1 testdata]', 1, 2, 34, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (117, 78, 2, 'Message queue dead-letter-hantering — uppdatering v2 [Version 2 testdata]', 'Meddelanden som misslyckas 3 gånger flyttas till DLQ [Version 2 testdata]', 1, 2, 34, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (118, 79, 1, 'Systemet ska stödja asynkron request-reply-mönster [Version 1 testdata]', 'Klienter får callback vid asynkron begäran inom SLA-tid [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (119, 80, 1, 'ETL-pipeline för dataintegration [Version 1 testdata]', 'Data extraheras, transformeras och laddas utan förlust [Version 1 testdata]', 2, 1, 2, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (120, 81, 1, 'Pub/sub-mekanism för lös koppling mellan tjänster [Version 1 testdata]', 'Subscribers tar emot events inom konfigurerad latens [Version 1 testdata]', 2, 2, 3, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (121, 82, 1, 'Integration med Azure Active Directory för användarsynk [Version 1 testdata]', 'AD-användare synkroniseras var 15:e minut [Version 1 testdata]', 3, 2, 4, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (122, 83, 1, 'REST API:er ska stödja HATEOAS-principer — initial version [Version 1 testdata]', 'Svar innehåller relevanta hyperlänkar för navigation [Version 1 testdata]', 1, 1, 11, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (123, 83, 2, 'REST API:er ska stödja HATEOAS-principer — uppdatering v2 [Version 2 testdata]', 'Svar innehåller relevanta hyperlänkar för navigation [Version 2 testdata]', 1, 1, 11, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (124, 83, 3, 'REST API:er ska stödja HATEOAS-principer — uppdatering v3 [Version 3 testdata]', 'Svar innehåller relevanta hyperlänkar för navigation [Version 3 testdata]', 1, 1, 11, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (125, 83, 4, 'REST API:er ska stödja HATEOAS-principer — uppdatering v4 [Version 4 testdata]', 'Svar innehåller relevanta hyperlänkar för navigation [Version 4 testdata]', 1, 1, 11, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (126, 84, 1, 'Circuit breaker-mönster för extern tjänstanrop [Version 1 testdata]', 'Circuit breaker öppnas efter 5 misslyckade anrop [Version 1 testdata]', 2, 2, 34, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (127, 85, 1, 'Idempotenta API-anrop med idempotency-nycklar [Version 1 testdata]', 'Duplicerade anrop returnerar samma resultat utan bieffekter [Version 1 testdata]', 2, 2, 37, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (128, 86, 1, 'Systemet ska stödja BFF-mönstret (Backend for Frontend) [Version 1 testdata]', 'Varje frontend har en dedikerad backend-proxy [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (129, 87, 1, 'Integration med ERP-system via OData-protokoll [Version 1 testdata]', 'ERP-data hämtas och uppdateras via OData-endpoints [Version 1 testdata]', 2, 2, 3, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (130, 88, 1, 'API-kontrakt ska valideras med Pact-tester — initial version [Version 1 testdata]', 'Kontraktsbrott detekteras automatiskt i CI-pipeline [Version 1 testdata]', 1, 2, 4, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (131, 88, 2, 'API-kontrakt ska valideras med Pact-tester — uppdatering v2 [Version 2 testdata]', 'Kontraktsbrott detekteras automatiskt i CI-pipeline [Version 2 testdata]', 1, 2, 4, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (132, 89, 1, 'CQRS-mönster för läs- och skrivseparation [Version 1 testdata]', 'Läs- och skrivmodeller uppdateras konsistent [Version 1 testdata]', 3, 1, 11, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (133, 90, 1, 'Saga-mönster för distribuerade transaktioner [Version 1 testdata]', 'Kompensationsåtgärder triggas vid misslyckade steg [Version 1 testdata]', 2, 2, 34, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (134, 91, 1, 'Systemet ska stödja Protocol Buffers för serialisering [Version 1 testdata]', 'Protobuf-meddelanden serialiseras 3x snabbare än JSON [Version 1 testdata]', 2, 2, 37, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (135, 92, 1, 'Systemet ska exponera health-check endpoints [Version 1 testdata]', 'Health-endpoint returnerar status för alla beroenden [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (136, 93, 1, 'Integration med meddelandetjänst för SMS och e-post — initial version [Version 1 testdata]', 'SMS och e-post skickas inom 30 sekunder efter händelse [Version 1 testdata]', 1, 2, 3, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (137, 93, 2, 'Integration med meddelandetjänst för SMS och e-post — uppdatering v2 [Version 2 testdata]', 'SMS och e-post skickas inom 30 sekunder efter händelse [Version 2 testdata]', 1, 2, 3, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (138, 93, 3, 'Integration med meddelandetjänst för SMS och e-post — uppdatering v3 [Version 3 testdata]', 'SMS och e-post skickas inom 30 sekunder efter händelse [Version 3 testdata]', 1, 2, 3, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (139, 94, 1, 'Service discovery med Consul för dynamisk routing [Version 1 testdata]', 'Tjänster registreras och hittas automatiskt via Consul [Version 1 testdata]', 2, 2, 4, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (140, 95, 1, 'API-throttling baserat på prenumerationsnivå [Version 1 testdata]', 'Premium-klienter får högre rate limits än gratisnivå [Version 1 testdata]', 2, 1, 11, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (141, 96, 1, 'Retry-policy med exponentiell backoff [Version 1 testdata]', 'Misslyckade anrop försöks igen med ökande intervall [Version 1 testdata]', 3, 2, 34, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (142, 97, 1, 'Async API-specifikation för event-drivna gränssnitt [Version 1 testdata]', 'AsyncAPI-dokument genereras för alla event-kanaler [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Säkerhet versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (143, 98, 1, 'Penetrationstestning ska genomföras kvartalsvis [Version 1 testdata]', 'Penetrationstest-rapport dokumenterar inga kritiska brister [Version 1 testdata]', 1, 1, 26, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (144, 99, 1, 'Web Application Firewall (WAF) ska skydda alla publika endpoints [Version 1 testdata]', 'WAF blockerar OWASP Top 10-attacker [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (145, 100, 1, 'Content Security Policy (CSP) ska implementeras på alla webbsidor [Version 1 testdata]', 'CSP-header returneras med strikt policy [Version 1 testdata]', 2, 2, 28, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (146, 101, 1, 'Säker hantering av hemligheter via HashiCorp Vault [Version 1 testdata]', 'Inga hemligheter lagras i källkod eller konfigurationsfiler [Version 1 testdata]', 2, 1, 29, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (147, 102, 1, 'Automatisk sårbarhetsskanning av Docker-images [Version 1 testdata]', 'Inga kritiska CVE:er tillåts i containerimages [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (148, 103, 1, 'DDoS-skydd ska implementeras för alla publika tjänster — initial version [Version 1 testdata]', 'DDoS-mitigation aktiveras vid trafikanomalier [Version 1 testdata]', 1, 2, 31, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (149, 103, 2, 'DDoS-skydd ska implementeras för alla publika tjänster — uppdatering v2 [Version 2 testdata]', 'DDoS-mitigation aktiveras vid trafikanomalier [Version 2 testdata]', 1, 2, 31, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (150, 104, 1, 'Supply chain security med signerade artefakter — initial version [Version 1 testdata]', 'Alla deployade artefakter har verifierbar signatur [Version 1 testdata]', 2, 1, 32, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (151, 104, 2, 'Supply chain security med signerade artefakter — uppdatering v2 [Version 2 testdata]', 'Alla deployade artefakter har verifierbar signatur [Version 2 testdata]', 2, 1, 32, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (152, 104, 3, 'Supply chain security med signerade artefakter — uppdatering v3 [Version 3 testdata]', 'Alla deployade artefakter har verifierbar signatur [Version 3 testdata]', 2, 1, 32, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (153, 105, 1, 'Runtime Application Self-Protection (RASP) [Version 1 testdata]', 'RASP blockerar injektionsattacker i realtid [Version 1 testdata]', 3, 2, 26, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (154, 106, 1, 'Säker sessionshantering med httpOnly och Secure-cookies [Version 1 testdata]', 'Cookies sätts med korrekta säkerhetsflaggor [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (155, 107, 1, 'Krypterad kommunikation mellan alla mikrotjänster [Version 1 testdata]', 'mTLS används för all intern kommunikation [Version 1 testdata]', 2, 1, 28, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (156, 108, 1, 'Implementering av Principle of Least Privilege för alla tjänstekonton — initial version [Version 1 testdata]', 'Tjänstekonton har minimala rättigheter för sin funktion [Version 1 testdata]', 1, 2, 29, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (157, 108, 2, 'Implementering av Principle of Least Privilege för alla tjänstekonton — uppdatering v2 [Version 2 testdata]', 'Tjänstekonton har minimala rättigheter för sin funktion [Version 2 testdata]', 1, 2, 29, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (158, 109, 1, 'Sårbarhetsprogram (bug bounty) ska vara aktivt [Version 1 testdata]', 'Rapporterade sårbarheter hanteras inom SLA-tid [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (159, 110, 1, 'Dataklassificering ska genomföras för alla informationstillgångar [Version 1 testdata]', 'Alla data har klassificeringsnivå (öppen, intern, konfidentiell, hemlig) [Version 1 testdata]', 2, 1, 31, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (160, 111, 1, 'Automatisk kodanalys med SAST-verktyg i CI/CD-pipeline [Version 1 testdata]', 'Inga högrisk-observationer i SAST-rapport vid deployment [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (161, 112, 1, 'DNS-säkerhet med DNSSEC för alla domäner [Version 1 testdata]', 'DNSSEC-validering lyckas för alla publika domäner [Version 1 testdata]', 3, 2, 26, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (162, 113, 1, 'Incidenthanteringsplan ska testas halvårsvis — initial version [Version 1 testdata]', 'Incidentövning genomförs med dokumenterade lärdomar [Version 1 testdata]', 1, 1, 27, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (163, 113, 2, 'Incidenthanteringsplan ska testas halvårsvis — uppdatering v2 [Version 2 testdata]', 'Incidentövning genomförs med dokumenterade lärdomar [Version 2 testdata]', 1, 1, 27, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (164, 113, 3, 'Incidenthanteringsplan ska testas halvårsvis — uppdatering v3 [Version 3 testdata]', 'Incidentövning genomförs med dokumenterade lärdomar [Version 3 testdata]', 1, 1, 27, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (165, 113, 4, 'Incidenthanteringsplan ska testas halvårsvis — uppdatering v4 [Version 4 testdata]', 'Incidentövning genomförs med dokumenterade lärdomar [Version 4 testdata]', 1, 1, 27, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (166, 114, 1, 'Zero Trust Network Access (ZTNA) för fjärråtkomst [Version 1 testdata]', 'Åtkomst beviljas baserat på enhetsstatus och identitet [Version 1 testdata]', 2, 2, 28, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (167, 115, 1, 'Key management med HSM för krypteringsnycklar [Version 1 testdata]', 'Master-nycklar lagras och hanteras i HSM-modul [Version 1 testdata]', 2, 2, 29, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (168, 116, 1, 'Threat modeling ska genomföras för varje ny funktion [Version 1 testdata]', 'STRIDE-analys dokumenteras innan implementation [Version 1 testdata]', 2, 1, 30, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (169, 117, 1, 'API-säkerhet med JWT-validering och scope-kontroll [Version 1 testdata]', 'JWT-tokens valideras mot korrekt issuer och scope [Version 1 testdata]', 2, 2, 31, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (170, 118, 1, 'Skydd mot Server-Side Request Forgery (SSRF) — initial version [Version 1 testdata]', 'Interna nätverksadresser blockeras i utgående förfrågningar [Version 1 testdata]', 1, 2, 32, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (171, 118, 2, 'Skydd mot Server-Side Request Forgery (SSRF) — uppdatering v2 [Version 2 testdata]', 'Interna nätverksadresser blockeras i utgående förfrågningar [Version 2 testdata]', 1, 2, 32, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (172, 119, 1, 'Säker filuppladdningshantering med virusskanning [Version 1 testdata]', 'Uppladdade filer skannas och skadliga filer blockeras [Version 1 testdata]', 3, 1, 26, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (173, 120, 1, 'Multi-faktor autentisering för samtliga administrativa gränssnitt [Version 1 testdata]', 'Admin-sidor kräver minst två autentiseringsfaktorer [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (174, 121, 1, 'Säkerhetshärdning av operativsystem enligt CIS Benchmarks [Version 1 testdata]', 'CIS-benchmark-skanning visar minst 95% compliance [Version 1 testdata]', 2, 2, 28, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (175, 122, 1, 'Regelbunden granskning av åtkomsträttigheter (access review) [Version 1 testdata]', 'Kvartalsvis access review genomförs med dokumentation [Version 1 testdata]', 2, 1, 29, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (176, 123, 1, 'Krypterad lagring av alla säkerhetsloggar — initial version [Version 1 testdata]', 'Säkerhetsloggar kan inte läsas utan dekryptering [Version 1 testdata]', 1, 2, 30, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (177, 123, 2, 'Krypterad lagring av alla säkerhetsloggar — uppdatering v2 [Version 2 testdata]', 'Säkerhetsloggar kan inte läsas utan dekryptering [Version 2 testdata]', 1, 2, 30, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (178, 123, 3, 'Krypterad lagring av alla säkerhetsloggar — uppdatering v3 [Version 3 testdata]', 'Säkerhetsloggar kan inte läsas utan dekryptering [Version 3 testdata]', 1, 2, 30, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (179, 124, 1, 'Implementering av DMARC, SPF och DKIM för e-postsäkerhet [Version 1 testdata]', 'E-postautentisering valideras med DMARC-policy på reject [Version 1 testdata]', 2, 2, 31, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (180, 125, 1, 'Nätverkssegmentering mellan miljöer (dev, staging, prod) [Version 1 testdata]', 'Produktionsdata kan inte nås från utvecklingsmiljöer [Version 1 testdata]', 2, 1, 32, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (181, 126, 1, 'Automatisk certifikathantering med ACME-protokoll [Version 1 testdata]', 'TLS-certifikat förnyas automatiskt innan utgång [Version 1 testdata]', 3, 2, 26, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (182, 127, 1, 'Privacy by Design-principer ska implementeras i alla nya system [Version 1 testdata]', 'DPIA genomförs och dokumenteras för alla nya tjänster [Version 1 testdata]', 2, 2, 27, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Prestanda versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (183, 128, 1, 'CDN-distribution för statiskt innehåll [Version 1 testdata]', 'Statiska resurser serveras från edge-noder med < 50ms latens [Version 1 testdata]', 1, 1, 5, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (184, 129, 1, 'Connection pooling för databasanslutningar [Version 1 testdata]', 'Databas-pool hanterar 500 samtidiga anslutningar stabilt [Version 1 testdata]', 2, 2, 6, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (185, 130, 1, 'Lazy loading av tunga resurser i frontend [Version 1 testdata]', 'Initial laddningstid reduceras med minst 40% [Version 1 testdata]', 2, 2, 7, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (186, 131, 1, 'Query-optimering med databasindex [Version 1 testdata]', 'Alla frekvent använda queries har execution plan < 100ms [Version 1 testdata]', 2, 1, 8, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (187, 132, 1, 'Minnescache med Redis för sessionsdata [Version 1 testdata]', 'Cache hit ratio överstiger 95% under normal drift [Version 1 testdata]', 2, 2, 41, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (188, 133, 1, 'Asynkron bearbetning av tunga operationer — initial version [Version 1 testdata]', 'Långvariga operationer körs i bakgrunden utan att blockera [Version 1 testdata]', 1, 2, 5, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (189, 133, 2, 'Asynkron bearbetning av tunga operationer — uppdatering v2 [Version 2 testdata]', 'Långvariga operationer körs i bakgrunden utan att blockera [Version 2 testdata]', 1, 2, 5, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (190, 134, 1, 'Bildoptimering med WebP och progressiv laddning — initial version [Version 1 testdata]', 'Bildstorlek reduceras med minst 50% jämfört med PNG [Version 1 testdata]', 2, 1, 6, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (191, 134, 2, 'Bildoptimering med WebP och progressiv laddning — uppdatering v2 [Version 2 testdata]', 'Bildstorlek reduceras med minst 50% jämfört med PNG [Version 2 testdata]', 2, 1, 6, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (192, 134, 3, 'Bildoptimering med WebP och progressiv laddning — uppdatering v3 [Version 3 testdata]', 'Bildstorlek reduceras med minst 50% jämfört med PNG [Version 3 testdata]', 2, 1, 6, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (193, 135, 1, 'Serverlös skalning med AWS Lambda eller Azure Functions [Version 1 testdata]', 'Lambda-funktioner startar inom 500ms (cold start) [Version 1 testdata]', 3, 2, 7, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (194, 136, 1, 'Database sharding för horisontell skalning [Version 1 testdata]', 'Data fördelas jämnt över shards med konsistent routing [Version 1 testdata]', 2, 2, 8, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (195, 137, 1, 'Prestandatestning med JMeter integrerat i CI/CD [Version 1 testdata]', 'Prestandaregression detekteras automatiskt i pipeline [Version 1 testdata]', 2, 1, 41, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (196, 138, 1, 'HTTP/2 och HTTP/3 stöd för alla API-endpoints — initial version [Version 1 testdata]', 'Multiplexade anslutningar reducerar latens med 30% [Version 1 testdata]', 1, 2, 5, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (197, 138, 2, 'HTTP/2 och HTTP/3 stöd för alla API-endpoints — uppdatering v2 [Version 2 testdata]', 'Multiplexade anslutningar reducerar latens med 30% [Version 2 testdata]', 1, 2, 5, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (198, 139, 1, 'Komprimering av API-svar med Brotli [Version 1 testdata]', 'API-svar komprimeras med minst 70% storleksreduktion [Version 1 testdata]', 2, 2, 6, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (199, 140, 1, 'Read replicas för läs-tunga databastransaktioner [Version 1 testdata]', 'Läsoperationer distribueras jämnt mellan replicas [Version 1 testdata]', 2, 1, 7, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (200, 141, 1, 'Optimistisk låsning för högfrekvent uppdatering [Version 1 testdata]', 'Simultana uppdateringar hanteras utan deadlocks [Version 1 testdata]', 2, 2, 8, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (201, 142, 1, 'Server-Side Rendering (SSR) för snabb initial rendering [Version 1 testdata]', 'First Contentful Paint under 1.5 sekunder [Version 1 testdata]', 3, 2, 41, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (202, 143, 1, 'Resource monitoring med Prometheus och Grafana — initial version [Version 1 testdata]', 'Alla systemresurser övervakas med 15s-intervall [Version 1 testdata]', 1, 1, 5, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (203, 143, 2, 'Resource monitoring med Prometheus och Grafana — uppdatering v2 [Version 2 testdata]', 'Alla systemresurser övervakas med 15s-intervall [Version 2 testdata]', 1, 1, 5, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (204, 143, 3, 'Resource monitoring med Prometheus och Grafana — uppdatering v3 [Version 3 testdata]', 'Alla systemresurser övervakas med 15s-intervall [Version 3 testdata]', 1, 1, 5, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (205, 143, 4, 'Resource monitoring med Prometheus och Grafana — uppdatering v4 [Version 4 testdata]', 'Alla systemresurser övervakas med 15s-intervall [Version 4 testdata]', 1, 1, 5, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (206, 144, 1, 'Load balancing med round-robin och health checks [Version 1 testdata]', 'Traffic omdirigeras automatiskt vid nod-failure [Version 1 testdata]', 2, 2, 6, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (207, 145, 1, 'Optimering av API-payload med GraphQL för mobilklienter [Version 1 testdata]', 'Mobilklienter hämtar bara nödvändig data per anrop [Version 1 testdata]', 2, 2, 7, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (208, 146, 1, 'Prestandabudget per sida (max 500 KB JavaScript) [Version 1 testdata]', 'Build misslyckas om JavaScript-budget överskrids [Version 1 testdata]', 2, 1, 8, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (209, 147, 1, 'Rate limiting per endpoint med sliding window [Version 1 testdata]', 'API svarar med HTTP 429 vid överskriden limit [Version 1 testdata]', 2, 2, 41, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (210, 148, 1, 'Databasmigrering utan nedtid med online DDL — initial version [Version 1 testdata]', 'Schema-ändringar appliceras utan att blockera queries [Version 1 testdata]', 1, 2, 5, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (211, 148, 2, 'Databasmigrering utan nedtid med online DDL — uppdatering v2 [Version 2 testdata]', 'Schema-ändringar appliceras utan att blockera queries [Version 2 testdata]', 1, 2, 5, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (212, 149, 1, 'Edge computing för latenskänsliga operationer [Version 1 testdata]', 'Edge-funktioner svarar inom 20ms för geolocation [Version 1 testdata]', 3, 1, 6, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (213, 150, 1, 'Batch-bearbetning med parallellisering [Version 1 testdata]', 'Batch-jobb slutförs 3x snabbare med parallella trådar [Version 1 testdata]', 2, 2, 7, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (214, 151, 1, 'Objektcache med TTL-baserad invalidering [Version 1 testdata]', 'Cache-invalidering sker korrekt vid dataändring [Version 1 testdata]', 2, 2, 8, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (215, 152, 1, 'Minnesprofilering för att identifiera läckor [Version 1 testdata]', 'Inga minnesläckor detekteras under 72h lasttest [Version 1 testdata]', 2, 1, 41, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (216, 153, 1, 'DNS-baserad load balancing med latency routing — initial version [Version 1 testdata]', 'Användare dirigeras till närmaste datacenter [Version 1 testdata]', 1, 2, 5, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (217, 153, 2, 'DNS-baserad load balancing med latency routing — uppdatering v2 [Version 2 testdata]', 'Användare dirigeras till närmaste datacenter [Version 2 testdata]', 1, 2, 5, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (218, 153, 3, 'DNS-baserad load balancing med latency routing — uppdatering v3 [Version 3 testdata]', 'Användare dirigeras till närmaste datacenter [Version 3 testdata]', 1, 2, 5, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (219, 154, 1, 'Streaming av stora datamängder utan buffering [Version 1 testdata]', 'Filer >= 1 GB streamas utan att fylla serverminne [Version 1 testdata]', 2, 2, 6, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (220, 155, 1, 'Prefetching av sannolika användarnavigationer [Version 1 testdata]', 'Sidövergångar upplevs som omedelbara med prefetch [Version 1 testdata]', 2, 1, 7, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (221, 156, 1, 'Adaptive bitrate för videostreaming [Version 1 testdata]', 'Videokvalitet anpassas till tillgänglig bandbredd [Version 1 testdata]', 3, 2, 8, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (222, 157, 1, 'Throttling av bakgrundsprocesser vid hög last [Version 1 testdata]', 'Bakgrundsjobb pausas automatiskt vid CPU > 80% [Version 1 testdata]', 2, 2, 41, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Användbarhet versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (223, 158, 1, 'Dark mode-stöd i hela applikationen [Version 1 testdata]', 'Alla vyer har korrekt dark mode med tillräcklig kontrast [Version 1 testdata]', 1, 1, 12, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (224, 159, 1, 'Tangentbordsnavigering för alla interaktiva element [Version 1 testdata]', 'Tab-ordning följer logisk visuell ordning [Version 1 testdata]', 2, 2, 13, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (225, 160, 1, 'Flerspråksstöd med dynamisk språkväxling [Version 1 testdata]', 'Språkbyte sker utan sidladdning och bevarar kontext [Version 1 testdata]', 2, 2, 14, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (226, 161, 1, 'Offline-läge med synkronisering vid återanslutning [Version 1 testdata]', 'Data sparas lokalt och synkroniseras automatiskt [Version 1 testdata]', 2, 1, 15, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (227, 162, 1, 'Anpassningsbara dashboards per användarroll [Version 1 testdata]', 'Användare kan konfigurera widgets och layout [Version 1 testdata]', 2, 2, 16, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (228, 163, 1, 'Progressiv Web App (PWA) med installationsstöd — initial version [Version 1 testdata]', 'App kan installeras och fungerar offline [Version 1 testdata]', 1, 2, 17, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (229, 163, 2, 'Progressiv Web App (PWA) med installationsstöd — uppdatering v2 [Version 2 testdata]', 'App kan installeras och fungerar offline [Version 2 testdata]', 1, 2, 17, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (230, 164, 1, 'Skärmlässupport med ARIA-attribut — initial version [Version 1 testdata]', 'VoiceOver och NVDA läser innehåll korrekt [Version 1 testdata]', 2, 1, 18, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (231, 164, 2, 'Skärmlässupport med ARIA-attribut — uppdatering v2 [Version 2 testdata]', 'VoiceOver och NVDA läser innehåll korrekt [Version 2 testdata]', 2, 1, 18, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (232, 164, 3, 'Skärmlässupport med ARIA-attribut — uppdatering v3 [Version 3 testdata]', 'VoiceOver och NVDA läser innehåll korrekt [Version 3 testdata]', 2, 1, 18, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (233, 165, 1, 'Drag-and-drop-funktionalitet för listor och filer [Version 1 testdata]', 'Drag-and-drop fungerar med mus och pekskärm [Version 1 testdata]', 3, 2, 19, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (234, 166, 1, 'Kontextuella snabbkommandon (keyboard shortcuts) [Version 1 testdata]', 'Vanliga operationer nås via tangentbordsgenvägar [Version 1 testdata]', 2, 2, 20, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (235, 167, 1, 'Design system med återanvändbara komponenter [Version 1 testdata]', 'Alla komponenter finns i Storybook med dokumentation [Version 1 testdata]', 2, 1, 12, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (236, 168, 1, 'Skeleton screens vid dataladdning — initial version [Version 1 testdata]', 'Skeleton-platshållare visas under laddning istället för spinner [Version 1 testdata]', 1, 2, 13, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (237, 168, 2, 'Skeleton screens vid dataladdning — uppdatering v2 [Version 2 testdata]', 'Skeleton-platshållare visas under laddning istället för spinner [Version 2 testdata]', 1, 2, 13, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (238, 169, 1, 'Sökning med autocomplete och fuzzy matching [Version 1 testdata]', 'Sökresultat visas inom 200ms med relevanta förslag [Version 1 testdata]', 2, 2, 14, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (239, 170, 1, 'Toasts och notifikationer för systemhändelser [Version 1 testdata]', 'Meddelanden visas korrekt och försvinner efter timeout [Version 1 testdata]', 2, 1, 15, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (240, 171, 1, 'Konfigurerbar tabellvy med kolumnsortering och filter [Version 1 testdata]', 'Användare kan sortera, filtrera och dölja kolumner [Version 1 testdata]', 2, 2, 16, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (241, 172, 1, 'Formulärvalidering med realtidsfeedback [Version 1 testdata]', 'Fältfel visas omedelbart vid ogiltig inmatning [Version 1 testdata]', 3, 2, 17, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (242, 173, 1, 'Responsiv typografi med clamp och rem-enheter — initial version [Version 1 testdata]', 'Text skalas proportionellt mellan 320px och 2560px [Version 1 testdata]', 1, 1, 18, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (243, 173, 2, 'Responsiv typografi med clamp och rem-enheter — uppdatering v2 [Version 2 testdata]', 'Text skalas proportionellt mellan 320px och 2560px [Version 2 testdata]', 1, 1, 18, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (244, 173, 3, 'Responsiv typografi med clamp och rem-enheter — uppdatering v3 [Version 3 testdata]', 'Text skalas proportionellt mellan 320px och 2560px [Version 3 testdata]', 1, 1, 18, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (245, 173, 4, 'Responsiv typografi med clamp och rem-enheter — uppdatering v4 [Version 4 testdata]', 'Text skalas proportionellt mellan 320px och 2560px [Version 4 testdata]', 1, 1, 18, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (246, 174, 1, 'Animationer med reducerad rörelse-stöd (prefers-reduced-motion) [Version 1 testdata]', 'Animationer respekterar OS-inställning för reducerad rörelse [Version 1 testdata]', 2, 2, 19, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (247, 175, 1, 'Breadcrumb-navigering för djupa sidstrukturer [Version 1 testdata]', 'Breadcrumbs visar korrekt sökväg till aktuell sida [Version 1 testdata]', 2, 2, 20, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (248, 176, 1, 'Infinite scroll med virtualiserad rendering [Version 1 testdata]', 'Listor med 10 000 poster renderas utan prestandaproblem [Version 1 testdata]', 2, 1, 12, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (249, 177, 1, 'Filtrering med URL-baserat tillstånd [Version 1 testdata]', 'Filterval bevaras i URL och kan delas som länk [Version 1 testdata]', 2, 2, 13, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (250, 178, 1, 'Multi-step wizard med stegindikator — initial version [Version 1 testdata]', 'Användare kan navigera fram och tillbaka i wizard-flödet [Version 1 testdata]', 1, 2, 14, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (251, 178, 2, 'Multi-step wizard med stegindikator — uppdatering v2 [Version 2 testdata]', 'Användare kan navigera fram och tillbaka i wizard-flödet [Version 2 testdata]', 1, 2, 14, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (252, 179, 1, 'Kontrastläge för synnedsättning [Version 1 testdata]', 'Högkontrastläge uppfyller WCAG AAA (7:1 kontrast) [Version 1 testdata]', 3, 1, 15, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (253, 180, 1, 'Stöd för RTL-layouter (Right-to-Left) [Version 1 testdata]', 'Arabisk och hebreisk text renderas korrekt med RTL-layout [Version 1 testdata]', 2, 2, 16, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (254, 181, 1, 'Undo/redo-funktionalitet för redigeringsåtgärder [Version 1 testdata]', 'Undo återställer senaste ändring, redo applicerar den igen [Version 1 testdata]', 2, 2, 17, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (255, 182, 1, 'Favoritmarkering och sparade vyer [Version 1 testdata]', 'Användare kan spara och ladda favoritvyer [Version 1 testdata]', 2, 1, 18, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (256, 183, 1, 'Responsiv bildhantering med srcset och sizes — initial version [Version 1 testdata]', 'Bilder laddas i optimal storlek per enhet och viewport [Version 1 testdata]', 1, 2, 19, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (257, 183, 2, 'Responsiv bildhantering med srcset och sizes — uppdatering v2 [Version 2 testdata]', 'Bilder laddas i optimal storlek per enhet och viewport [Version 2 testdata]', 1, 2, 19, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (258, 183, 3, 'Responsiv bildhantering med srcset och sizes — uppdatering v3 [Version 3 testdata]', 'Bilder laddas i optimal storlek per enhet och viewport [Version 3 testdata]', 1, 2, 19, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (259, 184, 1, 'Tillgängliga modaler och dialoger med fokushantering [Version 1 testdata]', 'Fokus fångas i modal och återställs vid stängning [Version 1 testdata]', 2, 2, 20, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (260, 185, 1, 'Customizable notification preferences per kanal [Version 1 testdata]', 'Användare kan välja notifieringskanal (e-post, push, SMS) [Version 1 testdata]', 2, 1, 12, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (261, 186, 1, 'Stöd för gestnavigering på touch-enheter [Version 1 testdata]', 'Swipe-gester fungerar för sidnavigering på mobil [Version 1 testdata]', 3, 2, 13, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (262, 187, 1, 'Snabb åtkomst via kommandopalett (Command Palette) [Version 1 testdata]', 'Ctrl+K öppnar sökbar kommandolista med alla åtgärder [Version 1 testdata]', 2, 2, 14, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Lagring versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (263, 188, 1, 'Objektlagring med S3-kompatibelt API [Version 1 testdata]', 'Filer lagras och hämtas via S3-protokollet utan fel [Version 1 testdata]', 1, 1, 21, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (264, 189, 1, 'Automatisk tiering av data baserat på åtkomstmönster [Version 1 testdata]', 'Sällan åtkomstdata flyttas till billigare lagringsnivå [Version 1 testdata]', 2, 2, 24, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (265, 190, 1, 'Deduplicering av identiska filer vid uppladdning [Version 1 testdata]', 'Identiska filer lagras bara en gång med referensräkning [Version 1 testdata]', 2, 2, 25, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (266, 191, 1, 'Krypterad lagring med per-tenant nycklar [Version 1 testdata]', 'Varje kunds data krypteras med unik nyckel [Version 1 testdata]', 2, 1, 8, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (267, 192, 1, 'Snapshotbaserad backup med inkrementell kopiering [Version 1 testdata]', 'Snapshots skapas inom 5 minuter för databaser < 1 TB [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (268, 193, 1, 'Geografiskt redundant lagring med asynkron replikering — initial version [Version 1 testdata]', 'Data replikeras till sekundärt datacenter inom 60 sekunder [Version 1 testdata]', 1, 2, 21, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (269, 193, 2, 'Geografiskt redundant lagring med asynkron replikering — uppdatering v2 [Version 2 testdata]', 'Data replikeras till sekundärt datacenter inom 60 sekunder [Version 2 testdata]', 1, 2, 21, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (270, 194, 1, 'Lifecycle management för automatisk borttagning — initial version [Version 1 testdata]', 'Data raderas automatiskt efter konfigurerad retentionstid [Version 1 testdata]', 2, 1, 24, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (271, 194, 2, 'Lifecycle management för automatisk borttagning — uppdatering v2 [Version 2 testdata]', 'Data raderas automatiskt efter konfigurerad retentionstid [Version 2 testdata]', 2, 1, 24, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (272, 194, 3, 'Lifecycle management för automatisk borttagning — uppdatering v3 [Version 3 testdata]', 'Data raderas automatiskt efter konfigurerad retentionstid [Version 3 testdata]', 2, 1, 24, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (273, 195, 1, 'Immutable storage för regulatorisk lagring [Version 1 testdata]', 'Lagrad data kan inte modifieras eller raderas under retentionstiden [Version 1 testdata]', 3, 2, 25, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (274, 196, 1, 'Komprimerad lagring med LZ4 för loggdata [Version 1 testdata]', 'Loggdata komprimeras med minst 60% utrymmesreduktion [Version 1 testdata]', 2, 2, 8, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (275, 197, 1, 'Versionshantering av konfigurationsfiler [Version 1 testdata]', 'Alla konfigurationsändringar versionshanteras med historik [Version 1 testdata]', 2, 1, 30, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (276, 198, 1, 'Cache-lagring med eviction-policy (LRU) — initial version [Version 1 testdata]', 'Äldsta cache-poster evicteras vid minnesgräns [Version 1 testdata]', 1, 2, 21, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (277, 198, 2, 'Cache-lagring med eviction-policy (LRU) — uppdatering v2 [Version 2 testdata]', 'Äldsta cache-poster evicteras vid minnesgräns [Version 2 testdata]', 1, 2, 21, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (278, 199, 1, 'WORM-lagring (Write Once Read Many) för compliance [Version 1 testdata]', 'Data markerad som WORM kan inte skrivas över [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (279, 200, 1, 'Data lake-integration med Parquet-format [Version 1 testdata]', 'Analysdata skrivs i Parquet-format till data lake [Version 1 testdata]', 2, 1, 25, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (280, 201, 1, 'Hot/warm/cold-lagringstopologi [Version 1 testdata]', 'Data migreras automatiskt mellan lagringsnivåer baserat på ålder [Version 1 testdata]', 2, 2, 8, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (281, 202, 1, 'Blocklagring med IOPS-garanti [Version 1 testdata]', 'Blocklagring levererar minst 3000 IOPS per volym [Version 1 testdata]', 3, 2, 30, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (282, 203, 1, 'Lagring av temporär data i efemär storage — initial version [Version 1 testdata]', 'Tillfällig data skapas och rensas automatiskt vid processslut [Version 1 testdata]', 1, 1, 21, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (283, 203, 2, 'Lagring av temporär data i efemär storage — uppdatering v2 [Version 2 testdata]', 'Tillfällig data skapas och rensas automatiskt vid processslut [Version 2 testdata]', 1, 1, 21, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (284, 203, 3, 'Lagring av temporär data i efemär storage — uppdatering v3 [Version 3 testdata]', 'Tillfällig data skapas och rensas automatiskt vid processslut [Version 3 testdata]', 1, 1, 21, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (285, 203, 4, 'Lagring av temporär data i efemär storage — uppdatering v4 [Version 4 testdata]', 'Tillfällig data skapas och rensas automatiskt vid processslut [Version 4 testdata]', 1, 1, 21, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (286, 204, 1, 'Fillagring med delningsstöd via NFS/SMB [Version 1 testdata]', 'Delade filsystem monteras korrekt i alla noder [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (287, 205, 1, 'Automatisk storleksökning av lagringsvolymer [Version 1 testdata]', 'Volymer utökas automatiskt vid 80% kapacitet [Version 1 testdata]', 2, 2, 25, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (288, 206, 1, 'Point-in-time recovery för relationsdatabaser [Version 1 testdata]', 'Databas återställs till valfri tidpunkt inom retentionsfönstret [Version 1 testdata]', 2, 1, 8, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (289, 207, 1, 'Metadata-indexering för snabb filsökning [Version 1 testdata]', 'Filsökning baserat på metadata returnerar resultat < 100ms [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (290, 208, 1, 'Klientsidig kryptering innan data lämnar enheten — initial version [Version 1 testdata]', 'Data krypteras i webbläsaren innan uppladdning [Version 1 testdata]', 1, 2, 21, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (291, 208, 2, 'Klientsidig kryptering innan data lämnar enheten — uppdatering v2 [Version 2 testdata]', 'Data krypteras i webbläsaren innan uppladdning [Version 2 testdata]', 1, 2, 21, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (292, 209, 1, 'Cross-region backup med verifiering [Version 1 testdata]', 'Backup till annan region verifieras dagligen med checksum [Version 1 testdata]', 3, 1, 24, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (293, 210, 1, 'Lagringskostnadsoptimering med analysverktyg [Version 1 testdata]', 'Kvartalsvis rapport visar lagringsanvändning och besparingsmöjligheter [Version 1 testdata]', 2, 2, 25, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (294, 211, 1, 'Content-addressable storage för oföränderlig data [Version 1 testdata]', 'Data adresseras via hash och kan inte dupliceras [Version 1 testdata]', 2, 2, 8, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (295, 212, 1, 'Stöd för multipart-uppladdning av stora filer [Version 1 testdata]', 'Filer > 100 MB laddas upp i delar med resumable upload [Version 1 testdata]', 2, 1, 30, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (296, 213, 1, 'Databas backup-testning med automatisk restore — initial version [Version 1 testdata]', 'Veckovis automatisk restore-test verifierar backup-integritet [Version 1 testdata]', 1, 2, 21, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (297, 213, 2, 'Databas backup-testning med automatisk restore — uppdatering v2 [Version 2 testdata]', 'Veckovis automatisk restore-test verifierar backup-integritet [Version 2 testdata]', 1, 2, 21, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (298, 213, 3, 'Databas backup-testning med automatisk restore — uppdatering v3 [Version 3 testdata]', 'Veckovis automatisk restore-test verifierar backup-integritet [Version 3 testdata]', 1, 2, 21, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (299, 214, 1, 'Arkivlagring med definierad hämtningstid [Version 1 testdata]', 'Arkiverad data tillgängliggörs inom 4 timmar efter begäran [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (300, 215, 1, 'Lagring av audit trail med tamper-evident logg [Version 1 testdata]', 'Audit trail kan inte modifieras efter skrivning [Version 1 testdata]', 2, 1, 25, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (301, 216, 1, 'Edge caching av statiska tillgångar [Version 1 testdata]', 'Statiskt innehåll serveras från edge med > 99% cache hit [Version 1 testdata]', 3, 2, 8, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (302, 217, 1, 'Datamigration mellan lagringssystem utan avbrott [Version 1 testdata]', 'Migreringsprocessen har noll nedtid för läsoperationer [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Behörighet versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (303, 218, 1, 'Fine-grained permissions på resurs- och fältnivå [Version 1 testdata]', 'Användare kan bara se fält de har behörighet till [Version 1 testdata]', 1, 1, 27, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (304, 219, 1, 'Dynamisk rollhantering med självbetjäning [Version 1 testdata]', 'Chefer kan tilldela roller till sina teammedlemmar [Version 1 testdata]', 2, 2, 30, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (305, 220, 1, 'Temporal access med automatisk revokering [Version 1 testdata]', 'Tillfällig åtkomst upphör automatiskt efter angiven tid [Version 1 testdata]', 2, 2, 31, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (306, 221, 1, 'Delegering av behörigheter med spårbarhet [Version 1 testdata]', 'Delegerade behörigheter loggas med ursprunglig och delegerad användare [Version 1 testdata]', 2, 1, 32, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (307, 222, 1, 'Separation of Duties (SoD) kontroller [Version 1 testdata]', 'Konflikterande roller kan inte tilldelas samma användare [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (308, 223, 1, 'API-scope-baserad behörighetskontroll — initial version [Version 1 testdata]', 'API-anrop utan korrekt scope avvisas med 403 [Version 1 testdata]', 1, 2, 27, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (309, 223, 2, 'API-scope-baserad behörighetskontroll — uppdatering v2 [Version 2 testdata]', 'API-anrop utan korrekt scope avvisas med 403 [Version 2 testdata]', 1, 2, 27, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (310, 224, 1, 'Behörighetsmatris per applikationsmodul — initial version [Version 1 testdata]', 'Varje modul har definierad åtkomstmatris med roller och rättigheter [Version 1 testdata]', 2, 1, 30, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (311, 224, 2, 'Behörighetsmatris per applikationsmodul — uppdatering v2 [Version 2 testdata]', 'Varje modul har definierad åtkomstmatris med roller och rättigheter [Version 2 testdata]', 2, 1, 30, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (312, 224, 3, 'Behörighetsmatris per applikationsmodul — uppdatering v3 [Version 3 testdata]', 'Varje modul har definierad åtkomstmatris med roller och rättigheter [Version 3 testdata]', 2, 1, 30, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (313, 225, 1, 'Break-glass-procedur för nödåtkomst [Version 1 testdata]', 'Nödåtkomst beviljas inom 5 minuter med fullständig loggning [Version 1 testdata]', 3, 2, 31, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (314, 226, 1, 'Organisationsbaserad dataisolering [Version 1 testdata]', 'Användare ser bara data inom sin organisationsenhet [Version 1 testdata]', 2, 2, 32, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (315, 227, 1, 'Just-in-time provisioning av systemåtkomst [Version 1 testdata]', 'Åtkomst skapas vid första inloggning baserat på roller [Version 1 testdata]', 2, 1, 2, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (316, 228, 1, 'Behörighetscache med TTL-baserad invalidering — initial version [Version 1 testdata]', 'Behörighetscache uppdateras inom 30 sekunder vid ändring [Version 1 testdata]', 1, 2, 27, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (317, 228, 2, 'Behörighetscache med TTL-baserad invalidering — uppdatering v2 [Version 2 testdata]', 'Behörighetscache uppdateras inom 30 sekunder vid ändring [Version 2 testdata]', 1, 2, 27, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (318, 229, 1, 'Centraliserad policyhantering med OPA (Open Policy Agent) [Version 1 testdata]', 'OPA-policyer utvärderas för alla åtkomstbeslut [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (319, 230, 1, 'Row-level security för databasåtkomst [Version 1 testdata]', 'Databasfrågor filtreras automatiskt baserat på användare [Version 1 testdata]', 2, 1, 31, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (320, 231, 1, 'Sudo-läge för känsliga operationer med re-autentisering [Version 1 testdata]', 'Känsliga operationer kräver lösenordsbekräftelse [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (321, 232, 1, 'Consent management för GDPR-samtycke [Version 1 testdata]', 'Användare kan granska och återkalla samtycken [Version 1 testdata]', 3, 2, 2, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (322, 233, 1, 'Behörighetsrapportering för revision — initial version [Version 1 testdata]', 'Revisionsrapport genereras med alla behörigheter per användare [Version 1 testdata]', 1, 1, 27, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (323, 233, 2, 'Behörighetsrapportering för revision — uppdatering v2 [Version 2 testdata]', 'Revisionsrapport genereras med alla behörigheter per användare [Version 2 testdata]', 1, 1, 27, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (324, 233, 3, 'Behörighetsrapportering för revision — uppdatering v3 [Version 3 testdata]', 'Revisionsrapport genereras med alla behörigheter per användare [Version 3 testdata]', 1, 1, 27, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (325, 233, 4, 'Behörighetsrapportering för revision — uppdatering v4 [Version 4 testdata]', 'Revisionsrapport genereras med alla behörigheter per användare [Version 4 testdata]', 1, 1, 27, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (326, 234, 1, 'IP-baserad åtkomstbegränsning per roll [Version 1 testdata]', 'Administratörer kan bara logga in från godkända IP-adresser [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (327, 235, 1, 'Data masking baserat på behörighetsnivå [Version 1 testdata]', 'Känsliga fält maskeras för användare utan full behörighet [Version 1 testdata]', 2, 2, 31, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (328, 236, 1, 'Grupp-baserad behörighetshantering med nesting [Version 1 testdata]', 'Grupper kan ärva behörigheter från överordnade grupper [Version 1 testdata]', 2, 1, 32, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (329, 237, 1, 'Automatisk avprovisionering vid organisations­förändring [Version 1 testdata]', 'Behörigheter uppdateras automatiskt vid flytt av organisationen [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (330, 238, 1, 'Behörighetsvalidering vid varje API-anrop — initial version [Version 1 testdata]', 'Behörigheter kontrolleras för varje request, inte bara vid inloggning [Version 1 testdata]', 1, 2, 27, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (331, 238, 2, 'Behörighetsvalidering vid varje API-anrop — uppdatering v2 [Version 2 testdata]', 'Behörigheter kontrolleras för varje request, inte bara vid inloggning [Version 2 testdata]', 1, 2, 27, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (332, 239, 1, 'Konfigurerbar godkännandeprocess för känslig åtkomst [Version 1 testdata]', 'Åtkomstbegäran kräver chefsgodkännande innan aktivering [Version 1 testdata]', 3, 1, 30, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (333, 240, 1, 'Multi-tenant behörighetshantering [Version 1 testdata]', 'Behörigheterna isoleras fullständigt mellan tenants [Version 1 testdata]', 2, 2, 31, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (334, 241, 1, 'Provisioning-workflow med automatisk notifiering [Version 1 testdata]', 'Ansvarig person notifieras vid ny åtkomstbegäran [Version 1 testdata]', 2, 2, 32, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (335, 242, 1, 'Behörighetssimulering (what-if-analys) [Version 1 testdata]', 'Administratörer kan simulera effekten av behörighetsändringar [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (336, 243, 1, 'Villkorlig åtkomst baserat på enhetsrisk — initial version [Version 1 testdata]', 'Ohanterade enheter får begränsad åtkomst [Version 1 testdata]', 1, 2, 27, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (337, 243, 2, 'Villkorlig åtkomst baserat på enhetsrisk — uppdatering v2 [Version 2 testdata]', 'Ohanterade enheter får begränsad åtkomst [Version 2 testdata]', 1, 2, 27, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (338, 243, 3, 'Villkorlig åtkomst baserat på enhetsrisk — uppdatering v3 [Version 3 testdata]', 'Ohanterade enheter får begränsad åtkomst [Version 3 testdata]', 1, 2, 27, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (339, 244, 1, 'Åtkomstlogg med realtidsövervakning [Version 1 testdata]', 'Avvikande åtkomstmönster triggar automatiskt larm [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (340, 245, 1, 'Behörighetstaggning med klassificering [Version 1 testdata]', 'Behörigheter kategoriseras som standard, privilegierad eller kritisk [Version 1 testdata]', 2, 1, 31, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (341, 246, 1, 'Historisk behörighetsvisning per användare [Version 1 testdata]', 'Fullständig behörighetshistorik visas för varje användare [Version 1 testdata]', 3, 2, 32, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (342, 247, 1, 'Automatiserad compliance-kontroll av behörigheter [Version 1 testdata]', 'System varnar vid behörigheter som bryter compliance-regler [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Identitet versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (343, 248, 1, 'Lösenordsfri autentisering med passkeys [Version 1 testdata]', 'Användare kan logga in med passkey utan lösenord [Version 1 testdata]', 1, 1, 31, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (344, 249, 1, 'Identity federation med flera externa IdP:er [Version 1 testdata]', 'Inloggning fungerar med Azure AD, Okta och Google [Version 1 testdata]', 2, 2, 32, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (345, 250, 1, 'Adaptiv autentisering baserat på riskbedömning [Version 1 testdata]', 'Hög-risk-inloggningar kräver ytterligare verifiering [Version 1 testdata]', 2, 2, 27, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (346, 251, 1, 'Self-service lösenordsåterställning [Version 1 testdata]', 'Användare kan återställa lösenord via e-post eller SMS [Version 1 testdata]', 2, 1, 29, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (347, 252, 1, 'Identitetsverifiering med BankID [Version 1 testdata]', 'BankID-autentisering fungerar med mobilt och kort-BankID [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (348, 253, 1, 'Identity lifecycle management med joiner-mover-leaver — initial version [Version 1 testdata]', 'Kontolivscykeln hanteras automatiskt baserat på HR-händelser [Version 1 testdata]', 1, 2, 31, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (349, 253, 2, 'Identity lifecycle management med joiner-mover-leaver — uppdatering v2 [Version 2 testdata]', 'Kontolivscykeln hanteras automatiskt baserat på HR-händelser [Version 2 testdata]', 1, 2, 31, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (350, 254, 1, 'Multipla autentiseringsnivåer (LoA) baserat på resurs — initial version [Version 1 testdata]', 'Känsliga resurser kräver LoA3-autentisering [Version 1 testdata]', 2, 1, 32, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (351, 254, 2, 'Multipla autentiseringsnivåer (LoA) baserat på resurs — uppdatering v2 [Version 2 testdata]', 'Känsliga resurser kräver LoA3-autentisering [Version 2 testdata]', 2, 1, 32, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (352, 254, 3, 'Multipla autentiseringsnivåer (LoA) baserat på resurs — uppdatering v3 [Version 3 testdata]', 'Känsliga resurser kräver LoA3-autentisering [Version 3 testdata]', 2, 1, 32, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (353, 255, 1, 'Device trust och registrering [Version 1 testdata]', 'Registrerade enheter får förtrodda-status efter godkännande [Version 1 testdata]', 3, 2, 27, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (354, 256, 1, 'API-nyckelhantering med rotation och revokering [Version 1 testdata]', 'API-nycklar kan skapas, roteras och revokeras via portal [Version 1 testdata]', 2, 2, 29, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (355, 257, 1, 'Social inloggning med Google, Microsoft och Apple [Version 1 testdata]', 'OAuth2-flöde fungerar korrekt med alla tre leverantörer [Version 1 testdata]', 2, 1, 2, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (356, 258, 1, 'Användarimpersonering med audit trail — initial version [Version 1 testdata]', 'Supportpersonal kan agera som användare med fullständig loggning [Version 1 testdata]', 1, 2, 31, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (357, 258, 2, 'Användarimpersonering med audit trail — uppdatering v2 [Version 2 testdata]', 'Supportpersonal kan agera som användare med fullständig loggning [Version 2 testdata]', 1, 2, 31, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (358, 259, 1, 'Session fixation-skydd med tokenbyte [Version 1 testdata]', 'Session-ID roteras vid inloggning och behörighetsändring [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (359, 260, 1, 'Biometrisk autentisering på mobila enheter [Version 1 testdata]', 'Fingeravtryck och ansiktsigenkänning fungerar på iOS och Android [Version 1 testdata]', 2, 1, 27, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (360, 261, 1, 'Centraliserad identitetskatalog med SCIM-provisionering [Version 1 testdata]', 'Användarkonton synkas via SCIM 2.0 med extern IdP [Version 1 testdata]', 2, 2, 29, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (361, 262, 1, 'Single Logout (SLO) för alla federerade sessioner [Version 1 testdata]', 'Utloggning avslutar sessioner i alla anslutna system [Version 1 testdata]', 3, 2, 2, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (362, 263, 1, 'Kontinuerlig autentisering med beteendeanalys — initial version [Version 1 testdata]', 'Avvikande beteende triggar re-autentisering [Version 1 testdata]', 1, 1, 31, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (363, 263, 2, 'Kontinuerlig autentisering med beteendeanalys — uppdatering v2 [Version 2 testdata]', 'Avvikande beteende triggar re-autentisering [Version 2 testdata]', 1, 1, 31, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (364, 263, 3, 'Kontinuerlig autentisering med beteendeanalys — uppdatering v3 [Version 3 testdata]', 'Avvikande beteende triggar re-autentisering [Version 3 testdata]', 1, 1, 31, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (365, 263, 4, 'Kontinuerlig autentisering med beteendeanalys — uppdatering v4 [Version 4 testdata]', 'Avvikande beteende triggar re-autentisering [Version 4 testdata]', 1, 1, 31, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (366, 264, 1, 'Just-in-time user provisioning vid första inloggning [Version 1 testdata]', 'Användarkonto skapas automatiskt vid första federerade inloggning [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (367, 265, 1, 'Identity governance med certifieringskampanjer [Version 1 testdata]', 'Kvartalsvis certifiering av alla behörigheter genomförs av chefer [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (368, 266, 1, 'OAuth2 device authorization flow för smarta enheter [Version 1 testdata]', 'IoT-enheter autentiseras via device code-flöde [Version 1 testdata]', 2, 1, 29, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (369, 267, 1, 'Bruteforce-skydd med progressiv fördröjning [Version 1 testdata]', 'Fördröjning ökar exponentiellt efter varje misslyckat försök [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (370, 268, 1, 'Multi-domain SSO med delad session — initial version [Version 1 testdata]', 'SSO fungerar över flera domäner utan omdirigering [Version 1 testdata]', 1, 2, 31, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (371, 268, 2, 'Multi-domain SSO med delad session — uppdatering v2 [Version 2 testdata]', 'SSO fungerar över flera domäner utan omdirigering [Version 2 testdata]', 1, 2, 31, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (372, 269, 1, 'Token-introspection endpoint för resursservrar [Version 1 testdata]', 'Resursservrar kan validera tokens via introspection-anrop [Version 1 testdata]', 3, 1, 32, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (373, 270, 1, 'Verifiable Credentials för decentraliserad identitet [Version 1 testdata]', 'Digital identitet kan presenteras och verifieras utan central server [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (374, 271, 1, 'Autentiseringsflöde med step-up vid känsliga operationer [Version 1 testdata]', 'Användare uppmanas stega upp autentisering vid behov [Version 1 testdata]', 2, 2, 29, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (375, 272, 1, 'Ephemeral sessions för delade enheter [Version 1 testdata]', 'Session rensas helt vid utloggning på delad enhet [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (376, 273, 1, 'Account linking för sammankoppling av identiteter — initial version [Version 1 testdata]', 'Användare kan koppla flera IdP-konton till ett systemkonto [Version 1 testdata]', 1, 2, 31, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (377, 273, 2, 'Account linking för sammankoppling av identiteter — uppdatering v2 [Version 2 testdata]', 'Användare kan koppla flera IdP-konton till ett systemkonto [Version 2 testdata]', 1, 2, 31, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (378, 273, 3, 'Account linking för sammankoppling av identiteter — uppdatering v3 [Version 3 testdata]', 'Användare kan koppla flera IdP-konton till ett systemkonto [Version 3 testdata]', 1, 2, 31, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (379, 274, 1, 'Anomalidetektering av inloggningsförsök [Version 1 testdata]', 'Ovanliga inloggningsmönster flaggas och utreds automatiskt [Version 1 testdata]', 2, 2, 32, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (380, 275, 1, 'Push notification för MFA-godkännande [Version 1 testdata]', 'MFA-bekräftelse via push tar max 30 sekunder [Version 1 testdata]', 2, 1, 27, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (381, 276, 1, 'Identitetsriskscore med maskininlärning [Version 1 testdata]', 'ML-modell beräknar riskpoäng för varje autentiseringsförsök [Version 1 testdata]', 3, 2, 29, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (382, 277, 1, 'TOTP och HOTP-stöd med backup-koder [Version 1 testdata]', 'Användare kan generera backup-koder för MFA-återställning [Version 1 testdata]', 2, 2, 2, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Loggning versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (383, 278, 1, 'Distribuerad tracing med OpenTelemetry [Version 1 testdata]', 'Traces propageras genom samtliga mikrotjänster [Version 1 testdata]', 1, 1, 36, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (384, 279, 1, 'Loggnivå-dynamisk ändring utan omstart [Version 1 testdata]', 'Loggnivå ändras via API utan att starta om tjänsten [Version 1 testdata]', 2, 2, 23, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (385, 280, 1, 'Centraliserad loggaggregering med Grafana Loki [Version 1 testdata]', 'Loggar från alla tjänster sökbara i Grafana inom 15s [Version 1 testdata]', 2, 2, 22, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (386, 281, 1, 'Audit trail för alla CRUD-operationer [Version 1 testdata]', 'Varje data-ändring loggas med före/efter-värden [Version 1 testdata]', 2, 1, 30, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (387, 282, 1, 'Metriker och KPI-dashboards per tjänst [Version 1 testdata]', 'SLI-metriker visualiseras i realtid per tjänst [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (388, 283, 1, 'Automatiserade larmregler med eskalering — initial version [Version 1 testdata]', 'Kritiska larm eskaleras inom 5 minuter om ej kvitterade [Version 1 testdata]', 1, 2, 36, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (389, 283, 2, 'Automatiserade larmregler med eskalering — uppdatering v2 [Version 2 testdata]', 'Kritiska larm eskaleras inom 5 minuter om ej kvitterade [Version 2 testdata]', 1, 2, 36, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (390, 284, 1, 'Loggbaserad anomalidetektering med ML — initial version [Version 1 testdata]', 'ML-modell identifierar avvikande logmönster [Version 1 testdata]', 2, 1, 23, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (391, 284, 2, 'Loggbaserad anomalidetektering med ML — uppdatering v2 [Version 2 testdata]', 'ML-modell identifierar avvikande logmönster [Version 2 testdata]', 2, 1, 23, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (392, 284, 3, 'Loggbaserad anomalidetektering med ML — uppdatering v3 [Version 3 testdata]', 'ML-modell identifierar avvikande logmönster [Version 3 testdata]', 2, 1, 23, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (393, 285, 1, 'Strukturerad loggning med kontextinformation [Version 1 testdata]', 'Alla logginlägg innehåller request-ID, tenant-ID och user-ID [Version 1 testdata]', 3, 2, 22, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (394, 286, 1, 'Real-time log streaming till utvecklare [Version 1 testdata]', 'Live-loggar kan streamas via CLI under felsökning [Version 1 testdata]', 2, 2, 30, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (395, 287, 1, 'Compliance-loggning enligt GDPR krav [Version 1 testdata]', 'Åtkomst till personuppgifter loggas med syftebeskrivning [Version 1 testdata]', 2, 1, 37, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (396, 288, 1, 'Metriker-export i Prometheus-format — initial version [Version 1 testdata]', 'Alla tjänster exponerar /metrics-endpoint med Prometheus-format [Version 1 testdata]', 1, 2, 36, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (397, 288, 2, 'Metriker-export i Prometheus-format — uppdatering v2 [Version 2 testdata]', 'Alla tjänster exponerar /metrics-endpoint med Prometheus-format [Version 2 testdata]', 1, 2, 36, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (398, 289, 1, 'Log shipping med garanterad leverans [Version 1 testdata]', 'Inga loggar går förlorade vid nätverksproblem (buffring) [Version 1 testdata]', 2, 2, 23, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (399, 290, 1, 'Custom log parsers för äldre applikationer [Version 1 testdata]', 'Legacy-loggar parsas och transformeras till strukturerat format [Version 1 testdata]', 2, 1, 22, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (400, 291, 1, 'SLO-baserad övervakning med error budgets [Version 1 testdata]', 'Error budget-förbrukning visualiseras per tjänst [Version 1 testdata]', 2, 2, 30, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (401, 292, 1, 'Business event-loggning för processövervakning [Version 1 testdata]', 'Affärshändelser spåras end-to-end i processdashboard [Version 1 testdata]', 3, 2, 37, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (402, 293, 1, 'Golden signals-övervakning (latens, trafik, fel, mättnad) — initial version [Version 1 testdata]', 'Alla fyra golden signals övervakas per tjänst [Version 1 testdata]', 1, 1, 36, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (403, 293, 2, 'Golden signals-övervakning (latens, trafik, fel, mättnad) — uppdatering v2 [Version 2 testdata]', 'Alla fyra golden signals övervakas per tjänst [Version 2 testdata]', 1, 1, 36, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (404, 293, 3, 'Golden signals-övervakning (latens, trafik, fel, mättnad) — uppdatering v3 [Version 3 testdata]', 'Alla fyra golden signals övervakas per tjänst [Version 3 testdata]', 1, 1, 36, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (405, 293, 4, 'Golden signals-övervakning (latens, trafik, fel, mättnad) — uppdatering v4 [Version 4 testdata]', 'Alla fyra golden signals övervakas per tjänst [Version 4 testdata]', 1, 1, 36, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (406, 294, 1, 'Loggarkivering med komprimering till cold storage [Version 1 testdata]', 'Loggar äldre än 90 dagar arkiveras komprimerade [Version 1 testdata]', 2, 2, 23, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (407, 295, 1, 'Health check-loggning med historik [Version 1 testdata]', 'Health check-resultat lagras och trendanalyseras [Version 1 testdata]', 2, 2, 22, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (408, 296, 1, 'Request/response-loggning med body sampling [Version 1 testdata]', 'Request/response loggas för felsökning med konfigurering sampling [Version 1 testdata]', 2, 1, 30, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (409, 297, 1, 'On-call rotation med automatisk schema [Version 1 testdata]', 'On-call-schema hanteras och notifieringar skickas automatiskt [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (410, 298, 1, 'Change tracking med automatisk diff-loggning — initial version [Version 1 testdata]', 'Konfigurationsändringar loggas med diff mellan gamla och nya värden [Version 1 testdata]', 1, 2, 36, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (411, 298, 2, 'Change tracking med automatisk diff-loggning — uppdatering v2 [Version 2 testdata]', 'Konfigurationsändringar loggas med diff mellan gamla och nya värden [Version 2 testdata]', 1, 2, 36, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (412, 299, 1, 'Database slow query logging med analys [Version 1 testdata]', 'Queries som tar > 1s loggas och analyseras automatiskt [Version 1 testdata]', 3, 1, 23, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (413, 300, 1, 'Frontend error tracking med stack traces [Version 1 testdata]', 'JavaScript-fel fångas och rapporteras med full kontext [Version 1 testdata]', 2, 2, 22, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (414, 301, 1, 'Syntetisk övervakning med simulerade användare [Version 1 testdata]', 'Testanvändare kör definierade flöden var 5:e minut [Version 1 testdata]', 2, 2, 30, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (415, 302, 1, 'Status page med realtidsuppdatering [Version 1 testdata]', 'Publik statussida uppdateras automatiskt vid driftstörning [Version 1 testdata]', 2, 1, 37, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (416, 303, 1, 'Log correlation med infrastrukturmetriker — initial version [Version 1 testdata]', 'Loggar kan korreleras med CPU, minne och disk-metriker [Version 1 testdata]', 1, 2, 36, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (417, 303, 2, 'Log correlation med infrastrukturmetriker — uppdatering v2 [Version 2 testdata]', 'Loggar kan korreleras med CPU, minne och disk-metriker [Version 2 testdata]', 1, 2, 36, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (418, 303, 3, 'Log correlation med infrastrukturmetriker — uppdatering v3 [Version 3 testdata]', 'Loggar kan korreleras med CPU, minne och disk-metriker [Version 3 testdata]', 1, 2, 36, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (419, 304, 1, 'Kapacitetsplanering baserat på trendanalys [Version 1 testdata]', 'Kapacitetsbehov prognostiseras 6 månader framåt [Version 1 testdata]', 2, 2, 23, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (420, 305, 1, 'Alert fatigue-reducering med intelligent gruppering [Version 1 testdata]', 'Relaterade larm grupperas för att minska brus [Version 1 testdata]', 2, 1, 22, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (421, 306, 1, 'Observerbarhet som kod (OaC) med versionerad config [Version 1 testdata]', 'Dashboards och larmregler versionshanteras i Git [Version 1 testdata]', 3, 2, 30, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (422, 307, 1, 'Post-mortem-loggning efter incidenter [Version 1 testdata]', 'Automatisk sammanfattning av relevanta loggar vid incident [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Drift versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (423, 308, 1, 'Blue-green deployment för riskfri utrullning [Version 1 testdata]', 'Trafik skiftar mellan blue/green utan nedtid [Version 1 testdata]', 1, 1, 23, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (424, 309, 1, 'Canary releases med automatisk rollback [Version 1 testdata]', 'Canary-release rullas tillbaka om error rate överstiger 1% [Version 1 testdata]', 2, 2, 24, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (425, 310, 1, 'GitOps-baserad deployment med ArgoCD [Version 1 testdata]', 'Deployment triggas automatiskt vid merge till main [Version 1 testdata]', 2, 2, 25, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (426, 311, 1, 'Feature flags för gradvis funktionsaktivering [Version 1 testdata]', 'Funktioner kan aktiveras per användarsegment [Version 1 testdata]', 2, 1, 37, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (427, 312, 1, 'Database migration med flyway/liquibase [Version 1 testdata]', 'Migreringar appliceras automatiskt vid deployment [Version 1 testdata]', 2, 2, 41, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (428, 313, 1, 'Container orchestration med Kubernetes — initial version [Version 1 testdata]', 'Pods hanteras med definierade resource limits och HPA [Version 1 testdata]', 1, 2, 42, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (429, 313, 2, 'Container orchestration med Kubernetes — uppdatering v2 [Version 2 testdata]', 'Pods hanteras med definierade resource limits och HPA [Version 2 testdata]', 1, 2, 42, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (430, 314, 1, 'Automatiserad skalning baserat på metriker — initial version [Version 1 testdata]', 'Auto-scaler reagerar på CPU- och minnesanvändning [Version 1 testdata]', 2, 1, 23, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (431, 314, 2, 'Automatiserad skalning baserat på metriker — uppdatering v2 [Version 2 testdata]', 'Auto-scaler reagerar på CPU- och minnesanvändning [Version 2 testdata]', 2, 1, 23, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (432, 314, 3, 'Automatiserad skalning baserat på metriker — uppdatering v3 [Version 3 testdata]', 'Auto-scaler reagerar på CPU- och minnesanvändning [Version 3 testdata]', 2, 1, 23, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (433, 315, 1, 'Disaster recovery med automatisk failover [Version 1 testdata]', 'Failover till sekundärt datacenter sker inom 5 minuter [Version 1 testdata]', 3, 2, 24, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (434, 316, 1, 'Chaos engineering med regelbundna experiment [Version 1 testdata]', 'Chaos-tester genomförs månatligen utan kundpåverkan [Version 1 testdata]', 2, 2, 25, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (435, 317, 1, 'Konfigurationshantering med centraliserad config service [Version 1 testdata]', 'Konfiguration uppdateras utan omdeployment [Version 1 testdata]', 2, 1, 37, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (436, 318, 1, 'Service Level Objectives (SLO) per tjänst — initial version [Version 1 testdata]', 'SLO:er definieras och övervakas med error budgets [Version 1 testdata]', 1, 2, 41, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (437, 318, 2, 'Service Level Objectives (SLO) per tjänst — uppdatering v2 [Version 2 testdata]', 'SLO:er definieras och övervakas med error budgets [Version 2 testdata]', 1, 2, 41, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (438, 319, 1, 'Immutable infrastructure med container images [Version 1 testdata]', 'Produktionsmiljöer ändras aldrig — nya images deployas [Version 1 testdata]', 2, 2, 42, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (439, 320, 1, 'Runbooks för vanliga driftoperationer [Version 1 testdata]', 'Alla vanliga driftoperationer har dokumenterade runbooks [Version 1 testdata]', 2, 1, 23, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (440, 321, 1, 'Kostnadsspårning per tjänst och miljö [Version 1 testdata]', 'Molnkostnader visas per tjänst i realtid [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (441, 322, 1, 'Multi-cloud strategi med portabla workloads [Version 1 testdata]', 'Applikationen kan köras på minst två molnleverantörer [Version 1 testdata]', 3, 2, 25, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (442, 323, 1, 'Nätverksövervakning med latens- och paketförlustmätning — initial version [Version 1 testdata]', 'Nätverkslatens mellan zoner mäts kontinuerligt [Version 1 testdata]', 1, 1, 37, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (443, 323, 2, 'Nätverksövervakning med latens- och paketförlustmätning — uppdatering v2 [Version 2 testdata]', 'Nätverkslatens mellan zoner mäts kontinuerligt [Version 2 testdata]', 1, 1, 37, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (444, 323, 3, 'Nätverksövervakning med latens- och paketförlustmätning — uppdatering v3 [Version 3 testdata]', 'Nätverkslatens mellan zoner mäts kontinuerligt [Version 3 testdata]', 1, 1, 37, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (445, 323, 4, 'Nätverksövervakning med latens- och paketförlustmätning — uppdatering v4 [Version 4 testdata]', 'Nätverkslatens mellan zoner mäts kontinuerligt [Version 4 testdata]', 1, 1, 37, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (446, 324, 1, 'Backup-verifiering med automatisk restore-test [Version 1 testdata]', 'Restore-test genomförs dagligen med rapport [Version 1 testdata]', 2, 2, 41, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (447, 325, 1, 'Kapacitetsplanering med prediktiv skalning [Version 1 testdata]', 'Resurser skalas upp inför förväntade trafikspikar [Version 1 testdata]', 2, 2, 42, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (448, 326, 1, 'Infrastrukturkodgranskning med policy-as-code [Version 1 testdata]', 'Terraform-kod valideras mot OPA-policyer i CI [Version 1 testdata]', 2, 1, 23, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (449, 327, 1, 'Underhållsschema med automatiserad patching [Version 1 testdata]', 'OS-patchar appliceras automatiskt under underhållsfönster [Version 1 testdata]', 2, 2, 24, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (450, 328, 1, 'DNS-hantering med automatiserad zonkonfiguration — initial version [Version 1 testdata]', 'DNS-poster uppdateras automatiskt vid deployment [Version 1 testdata]', 1, 2, 25, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (451, 328, 2, 'DNS-hantering med automatiserad zonkonfiguration — uppdatering v2 [Version 2 testdata]', 'DNS-poster uppdateras automatiskt vid deployment [Version 2 testdata]', 1, 2, 25, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (452, 329, 1, 'TLS-terminering med automatisk certifikatförnyelse [Version 1 testdata]', 'Certifikat förnyas 30 dagar innan utgång [Version 1 testdata]', 3, 1, 37, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (453, 330, 1, 'Secret rotation utan tjänsteavbrott [Version 1 testdata]', 'Hemligheter roteras automatiskt utan påverkan på tjänster [Version 1 testdata]', 2, 2, 41, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (454, 331, 1, 'Driftmiljö-paritet mellan staging och produktion [Version 1 testdata]', 'Staging-miljö är identisk kopia av produktion [Version 1 testdata]', 2, 2, 42, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (455, 332, 1, 'Incident response automation med playbooks [Version 1 testdata]', 'Automatiserade playbooks körs vid kända incidentmönster [Version 1 testdata]', 2, 1, 23, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (456, 333, 1, 'Release management med automatiserade release notes — initial version [Version 1 testdata]', 'Release notes genereras automatiskt från commit-meddelanden [Version 1 testdata]', 1, 2, 24, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (457, 333, 2, 'Release management med automatiserade release notes — uppdatering v2 [Version 2 testdata]', 'Release notes genereras automatiskt från commit-meddelanden [Version 2 testdata]', 1, 2, 24, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (458, 333, 3, 'Release management med automatiserade release notes — uppdatering v3 [Version 3 testdata]', 'Release notes genereras automatiskt från commit-meddelanden [Version 3 testdata]', 1, 2, 24, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (459, 334, 1, 'Gradvis utrullning med procentbaserad trafikstyrning [Version 1 testdata]', 'Traffic styrs gradvis 10% → 50% → 100% till ny version [Version 1 testdata]', 2, 2, 25, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (460, 335, 1, 'SRE-metriker med MTTR och MTBF-spårning [Version 1 testdata]', 'Mean Time To Recovery mäts och rapporteras per incident [Version 1 testdata]', 2, 1, 37, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (461, 336, 1, 'Isolerade testmiljöer per pull request [Version 1 testdata]', 'Varje PR har en egen temporär miljö för testning [Version 1 testdata]', 3, 2, 41, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (462, 337, 1, 'Drift-dokumentation med automatiserad uppdatering [Version 1 testdata]', 'Driftdokumentation genereras från infrastrukturkod [Version 1 testdata]', 2, 2, 42, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- === New Data versions ===
INSERT OR IGNORE INTO requirement_versions (id, requirement_id, version_number, description, acceptance_criteria, requirement_category_id, requirement_type_id, requirement_type_category_id, requirement_status_id, is_testing_required, created_at, created_by, edited_at, published_at, archived_at) VALUES
  (463, 338, 1, 'Datakatalog med automatisk metadata-insamling [Version 1 testdata]', 'Metadata indexeras automatiskt för alla datatillgångar [Version 1 testdata]', 1, 1, 2, 3, 0, datetime('now', '-200 days'), 'seed', datetime('now', '-198 days'), datetime('now', '-197 days'), NULL),
  (464, 339, 1, 'Data lineage-spårning end-to-end [Version 1 testdata]', 'Data kan spåras från källa till destination genom alla transformationer [Version 1 testdata]', 2, 2, 3, 1, 1, datetime('now', '-195 days'), 'security-admin', datetime('now', '-193 days'), NULL, NULL),
  (465, 340, 1, 'Datakvalitetsvalidering med Great Expectations [Version 1 testdata]', 'Datakvalitets-checks körs automatiskt i pipeline [Version 1 testdata]', 2, 2, 28, 2, 1, datetime('now', '-190 days'), 'devops-lead', datetime('now', '-188 days'), NULL, NULL),
  (466, 341, 1, 'Master Data Management (MDM) för gemensamma referensdata [Version 1 testdata]', 'Referensdata hanteras centralt med versionering [Version 1 testdata]', 2, 1, 36, 3, 0, datetime('now', '-185 days'), 'data-admin', datetime('now', '-183 days'), datetime('now', '-182 days'), NULL),
  (467, 342, 1, 'GDPR-compliance med automated data mapping [Version 1 testdata]', 'Personuppgiftsregister uppdateras automatiskt vid schemaändringar [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-180 days'), 'platform-eng', datetime('now', '-178 days'), datetime('now', '-177 days'), NULL),
  (468, 343, 1, 'Data masking i icke-produktionsmiljöer — initial version [Version 1 testdata]', 'Testmiljöer innehåller anonymiserade produktionsdata [Version 1 testdata]', 1, 2, 27, 4, 1, datetime('now', '-175 days'), 'seed', datetime('now', '-173 days'), datetime('now', '-172 days'), datetime('now', '-160 days')),
  (469, 343, 2, 'Data masking i icke-produktionsmiljöer — uppdatering v2 [Version 2 testdata]', 'Testmiljöer innehåller anonymiserade produktionsdata [Version 2 testdata]', 1, 2, 27, 3, 1, datetime('now', '-145 days'), 'seed', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (470, 344, 1, 'Schema registry för event-data med Avro — initial version [Version 1 testdata]', 'Schemakompatibilitet valideras automatiskt vid publicering [Version 1 testdata]', 2, 1, 2, 4, 0, datetime('now', '-170 days'), 'security-admin', datetime('now', '-168 days'), datetime('now', '-167 days'), datetime('now', '-155 days')),
  (471, 344, 2, 'Schema registry för event-data med Avro — uppdatering v2 [Version 2 testdata]', 'Schemakompatibilitet valideras automatiskt vid publicering [Version 2 testdata]', 2, 1, 2, 4, 0, datetime('now', '-140 days'), 'security-admin', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (472, 344, 3, 'Schema registry för event-data med Avro — uppdatering v3 [Version 3 testdata]', 'Schemakompatibilitet valideras automatiskt vid publicering [Version 3 testdata]', 2, 1, 2, 1, 0, datetime('now', '-110 days'), 'security-admin', datetime('now', '-108 days'), NULL, NULL),
  (473, 345, 1, 'Data retention policy enforcement [Version 1 testdata]', 'Data äldre än retentionsgräns raderas automatiskt [Version 1 testdata]', 3, 2, 3, 3, 1, datetime('now', '-165 days'), 'devops-lead', datetime('now', '-163 days'), datetime('now', '-162 days'), NULL),
  (474, 346, 1, 'Incremental data sync mellan system [Version 1 testdata]', 'Bara ändrade poster synkroniseras vid varje körning [Version 1 testdata]', 2, 2, 28, 1, 1, datetime('now', '-160 days'), 'data-admin', datetime('now', '-158 days'), NULL, NULL),
  (475, 347, 1, 'Data partitionering baserat på tidsfönster [Version 1 testdata]', 'Data partitioneras per månad med automatisk partition management [Version 1 testdata]', 2, 1, 36, 2, 0, datetime('now', '-155 days'), 'platform-eng', datetime('now', '-153 days'), NULL, NULL),
  (476, 348, 1, 'Dataåtkomstloggning för compliance — initial version [Version 1 testdata]', 'All åtkomst till känslig data loggas med syfte [Version 1 testdata]', 1, 2, 37, 3, 1, datetime('now', '-150 days'), 'seed', datetime('now', '-148 days'), datetime('now', '-147 days'), NULL),
  (477, 348, 2, 'Dataåtkomstloggning för compliance — uppdatering v2 [Version 2 testdata]', 'All åtkomst till känslig data loggas med syfte [Version 2 testdata]', 1, 2, 37, 1, 1, datetime('now', '-120 days'), 'seed', datetime('now', '-118 days'), NULL, NULL),
  (478, 349, 1, 'Data freshness SLOs med automatisk övervakning [Version 1 testdata]', 'Data freshness mäts och visualiseras per dataset [Version 1 testdata]', 2, 2, 27, 3, 1, datetime('now', '-145 days'), 'security-admin', datetime('now', '-143 days'), datetime('now', '-142 days'), NULL),
  (479, 350, 1, 'Cross-system referential integrity-validering [Version 1 testdata]', 'Referensintegritet kontrolleras mellan system dagligen [Version 1 testdata]', 2, 1, 2, 4, 0, datetime('now', '-140 days'), 'devops-lead', datetime('now', '-138 days'), datetime('now', '-137 days'), datetime('now', '-125 days')),
  (480, 351, 1, 'Automatisk datatyp-detection vid import [Version 1 testdata]', 'Datatyper identifieras automatiskt vid filimport [Version 1 testdata]', 2, 2, 3, 3, 1, datetime('now', '-135 days'), 'data-admin', datetime('now', '-133 days'), datetime('now', '-132 days'), NULL),
  (481, 352, 1, 'Data cleansing pipeline med regelbaserad validering [Version 1 testdata]', 'Felaktig data korrigeras automatiskt enligt definierade regler [Version 1 testdata]', 3, 2, 28, 2, 1, datetime('now', '-130 days'), 'platform-eng', datetime('now', '-128 days'), NULL, NULL),
  (482, 353, 1, 'Versionshantering av dataset med delta-lagring — initial version [Version 1 testdata]', 'Dataset-versioner lagras med bara delta-skillnader [Version 1 testdata]', 1, 1, 36, 4, 0, datetime('now', '-125 days'), 'seed', datetime('now', '-123 days'), datetime('now', '-122 days'), datetime('now', '-110 days')),
  (483, 353, 2, 'Versionshantering av dataset med delta-lagring — uppdatering v2 [Version 2 testdata]', 'Dataset-versioner lagras med bara delta-skillnader [Version 2 testdata]', 1, 1, 36, 4, 0, datetime('now', '-95 days'), 'seed', datetime('now', '-93 days'), datetime('now', '-92 days'), datetime('now', '-80 days')),
  (484, 353, 3, 'Versionshantering av dataset med delta-lagring — uppdatering v3 [Version 3 testdata]', 'Dataset-versioner lagras med bara delta-skillnader [Version 3 testdata]', 1, 1, 36, 3, 0, datetime('now', '-65 days'), 'seed', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (485, 353, 4, 'Versionshantering av dataset med delta-lagring — uppdatering v4 [Version 4 testdata]', 'Dataset-versioner lagras med bara delta-skillnader [Version 4 testdata]', 1, 1, 36, 2, 0, datetime('now', '-35 days'), 'seed', datetime('now', '-33 days'), NULL, NULL),
  (486, 354, 1, 'PII-scanning av databaser med automatisk klassificering [Version 1 testdata]', 'Personuppgifter identifieras och klassificeras automatiskt [Version 1 testdata]', 2, 2, 37, 3, 1, datetime('now', '-120 days'), 'security-admin', datetime('now', '-118 days'), datetime('now', '-117 days'), NULL),
  (487, 355, 1, 'Data access request-workflow (DSAR) för GDPR [Version 1 testdata]', 'DSAR-begäran hanteras inom 30 dagar med automatisering [Version 1 testdata]', 2, 2, 27, 1, 1, datetime('now', '-115 days'), 'devops-lead', datetime('now', '-113 days'), NULL, NULL),
  (488, 356, 1, 'Temporal data management med bitemporala tabeller [Version 1 testdata]', 'System-tid och giltighetstid spåras parallellt för all data [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-110 days'), 'data-admin', datetime('now', '-108 days'), datetime('now', '-107 days'), NULL),
  (489, 357, 1, 'Materialized views för komplexa rapportfrågor [Version 1 testdata]', 'Rapporter genereras från materialized views inom 5 sekunder [Version 1 testdata]', 2, 2, 3, 3, 1, datetime('now', '-105 days'), 'platform-eng', datetime('now', '-103 days'), datetime('now', '-102 days'), NULL),
  (490, 358, 1, 'Data federation utan fysisk kopiering — initial version [Version 1 testdata]', 'Distribuerade data kan frågas via enhetligt API utan kopiering [Version 1 testdata]', 1, 2, 28, 3, 1, datetime('now', '-100 days'), 'seed', datetime('now', '-98 days'), datetime('now', '-97 days'), NULL),
  (491, 358, 2, 'Data federation utan fysisk kopiering — uppdatering v2 [Version 2 testdata]', 'Distribuerade data kan frågas via enhetligt API utan kopiering [Version 2 testdata]', 1, 2, 28, 2, 1, datetime('now', '-70 days'), 'seed', datetime('now', '-68 days'), NULL, NULL),
  (492, 359, 1, 'Automatisk skalning av datalager baserat på volym [Version 1 testdata]', 'Datalager skalas automatiskt vid volymökning [Version 1 testdata]', 3, 1, 36, 3, 0, datetime('now', '-95 days'), 'security-admin', datetime('now', '-93 days'), datetime('now', '-92 days'), NULL),
  (493, 360, 1, 'Data encryption at rest med transparent kryptering [Version 1 testdata]', 'All data krypteras transparent utan applikationsändringar [Version 1 testdata]', 2, 2, 37, 1, 1, datetime('now', '-90 days'), 'devops-lead', datetime('now', '-88 days'), NULL, NULL),
  (494, 361, 1, 'Data product thinking med domänägande [Version 1 testdata]', 'Varje datadomän har definierad ägare och kvalitetsmål [Version 1 testdata]', 2, 2, 27, 2, 1, datetime('now', '-85 days'), 'data-admin', datetime('now', '-83 days'), NULL, NULL),
  (495, 362, 1, 'Change feed / event sourcing för datahistorik [Version 1 testdata]', 'Alla dataändringar publiceras som events med full historik [Version 1 testdata]', 2, 1, 2, 3, 0, datetime('now', '-80 days'), 'platform-eng', datetime('now', '-78 days'), datetime('now', '-77 days'), NULL),
  (496, 363, 1, 'Data mesh-arkitektur med decentraliserat ägande — initial version [Version 1 testdata]', 'Datadomäner publicerar data som self-service data products [Version 1 testdata]', 1, 2, 3, 4, 1, datetime('now', '-75 days'), 'seed', datetime('now', '-73 days'), datetime('now', '-72 days'), datetime('now', '-60 days')),
  (497, 363, 2, 'Data mesh-arkitektur med decentraliserat ägande — uppdatering v2 [Version 2 testdata]', 'Datadomäner publicerar data som self-service data products [Version 2 testdata]', 1, 2, 3, 3, 1, datetime('now', '-45 days'), 'seed', datetime('now', '-43 days'), datetime('now', '-42 days'), NULL),
  (498, 363, 3, 'Data mesh-arkitektur med decentraliserat ägande — uppdatering v3 [Version 3 testdata]', 'Datadomäner publicerar data som self-service data products [Version 3 testdata]', 1, 2, 3, 1, 1, datetime('now', '-15 days'), 'seed', datetime('now', '-13 days'), NULL, NULL),
  (499, 364, 1, 'Automatiserad datavalidering vid batch-import [Version 1 testdata]', 'Import avbryts om mer än 5% av rader har valideringsfel [Version 1 testdata]', 2, 2, 28, 3, 1, datetime('now', '-70 days'), 'security-admin', datetime('now', '-68 days'), datetime('now', '-67 days'), NULL),
  (500, 365, 1, 'API-baserad dataexport med paginering [Version 1 testdata]', 'Export-API stödjer cursor-baserad paginering med konsistent data [Version 1 testdata]', 2, 1, 36, 3, 0, datetime('now', '-65 days'), 'devops-lead', datetime('now', '-63 days'), datetime('now', '-62 days'), NULL),
  (501, 366, 1, 'Syntetisk testdata-generering [Version 1 testdata]', 'Realistisk testdata genereras automatiskt utan produktionsdata [Version 1 testdata]', 3, 2, 37, 1, 1, datetime('now', '-60 days'), 'data-admin', datetime('now', '-58 days'), NULL, NULL),
  (502, 367, 1, 'Data observability med anomalidetektering [Version 1 testdata]', 'Dataanomalier (volym, schema, freshness) detekteras automatiskt [Version 1 testdata]', 2, 2, 27, 3, 1, datetime('now', '-55 days'), 'platform-eng', datetime('now', '-53 days'), datetime('now', '-52 days'), NULL);

-- ─── Requirement Scenarios (sample) ──────────────────────────────────────────
INSERT OR IGNORE INTO requirement_scenarios (id, name_sv, name_en, description_sv, description_en, owner, created_at, updated_at) VALUES
  (1, 'Normal driftscenario', 'Normal operation scenario', 'Systemet körs under normal belastning med typiskt antal samtidiga användare', 'The system runs under normal load with a typical number of concurrent users', 'owner-1', datetime('now'), datetime('now')),
  (2, 'Hög belastning', 'High load', 'Systemet utsätts för maximal förväntad belastning under topptider', 'The system is subjected to maximum expected load during peak times', 'owner-1', datetime('now'), datetime('now')),
  (3, 'Katastrofåterställning', 'Disaster recovery', 'Systemet återställs efter ett allvarligt avbrott', 'The system is restored after a serious interruption', 'owner-2', datetime('now'), datetime('now'));

UPDATE requirement_scenarios SET name_sv = 'Normal driftscenario', name_en = 'Normal operation scenario', description_sv = 'Systemet körs under normal belastning med typiskt antal samtidiga användare', description_en = 'The system runs under normal load with a typical number of concurrent users' WHERE id = 1;
UPDATE requirement_scenarios SET name_sv = 'Hög belastning', name_en = 'High load', description_sv = 'Systemet utsätts för maximal förväntad belastning under topptider', description_en = 'The system is subjected to maximum expected load during peak times' WHERE id = 2;
UPDATE requirement_scenarios SET name_sv = 'Katastrofåterställning', name_en = 'Disaster recovery', description_sv = 'Systemet återställs efter ett allvarligt avbrott', description_en = 'The system is restored after a serious interruption' WHERE id = 3;

-- ─── Requirement Version ↔ Scenario links ────────────────────────────────────
INSERT OR IGNORE INTO requirement_version_scenarios (requirement_version_id, requirement_scenario_id) VALUES
  (2, 1),
  (5, 1),
  (7, 1),
  (7, 2),
  (23, 2),
  (26, 2),
  (33, 3),
  (56, 1),
  (57, 3),
  (69, 3),
  (70, 3);

-- ─── Requirement References (sample) ────────────────────────────────────────
INSERT OR IGNORE INTO requirement_references (id, requirement_version_id, name, uri, owner, created_at) VALUES
  (1, 5, 'OWASP API Security Top 10', 'https://owasp.org/API-Security/', 'owner-2', datetime('now')),
  (2, 6, 'GDPR Artikel 32', 'https://gdpr-info.eu/art-32-gdpr/', 'owner-2', datetime('now')),
  (3, 2, 'REST API Design Guidelines', 'https://restfulapi.net/', 'owner-1', datetime('now'));

-- ─── Package Responsibility Areas (taxonomy) ───────────────────────────────────
INSERT OR IGNORE INTO package_responsibility_areas (id, name_sv, name_en) VALUES
  (1, 'Förvaltningsobjekt', 'Management object'),
  (2, 'Projekt', 'Project'),
  (3, 'Uppdrag', 'Assignment'),
  (4, 'Leveransområde', 'Delivery area'),
  (5, 'Tjänsteområde', 'Service area');

UPDATE package_responsibility_areas SET name_sv = 'Förvaltningsobjekt', name_en = 'Management object' WHERE id = 1;
UPDATE package_responsibility_areas SET name_sv = 'Projekt', name_en = 'Project' WHERE id = 2;
UPDATE package_responsibility_areas SET name_sv = 'Uppdrag', name_en = 'Assignment' WHERE id = 3;
UPDATE package_responsibility_areas SET name_sv = 'Leveransområde', name_en = 'Delivery area' WHERE id = 4;
UPDATE package_responsibility_areas SET name_sv = 'Tjänsteområde', name_en = 'Service area' WHERE id = 5;

-- ─── Package Implementation Types (taxonomy) ────────────────────────────────────
INSERT OR IGNORE INTO package_implementation_types (id, name_sv, name_en) VALUES
  (1, 'Upphandling', 'Procurement'),
  (2, 'Utveckling', 'Development');

UPDATE package_implementation_types SET name_sv = 'Upphandling', name_en = 'Procurement' WHERE id = 1;
UPDATE package_implementation_types SET name_sv = 'Utveckling', name_en = 'Development' WHERE id = 2;

-- ─── Requirement Packages (sample) ──────────────────────────────────────────
INSERT OR IGNORE INTO requirement_packages (id, name_sv, name_en, package_responsibility_area_id, package_implementation_type_id, created_at, updated_at) VALUES
  (1, 'Integrationsplattform 2026', 'Integration Platform 2026', 1, 1, datetime('now'), datetime('now')),
  (2, 'Säkerhetslyft Q2', 'Security Uplift Q2', 1, 2, datetime('now'), datetime('now'));

UPDATE requirement_packages SET name_sv = 'Integrationsplattform 2026', name_en = 'Integration Platform 2026', package_responsibility_area_id = 1, package_implementation_type_id = 1 WHERE id = 1;
UPDATE requirement_packages SET name_sv = 'Säkerhetslyft Q2', name_en = 'Security Uplift Q2', package_responsibility_area_id = 1, package_implementation_type_id = 2 WHERE id = 2;

-- ─── Requirement Package Items (sample) ──────────────────────────────────────
INSERT OR IGNORE INTO requirement_package_items (id, requirement_package_id, requirement_id, requirement_version_id, needs_reference, created_at) VALUES
  (1, 1, 1, 2, 'Behov av integrerad plattform enligt verksamhetsplan 2026', datetime('now')),
  (2, 1, 2, 3, 'Dataimport krävs för migrering', datetime('now')),
  (3, 2, 4, 5, 'Krav från IT-säkerhetsrevision 2025', datetime('now')),
  (4, 2, 5, 6, 'GDPR-efterlevnad', datetime('now'));
`

console.log(seedSQL)
console.log(
  '-- Seed data generated. Pipe to: wrangler d1 execute kravhantering-db --local --command "..."',
)
console.log(
  '-- Or use: node drizzle/seed.ts | wrangler d1 execute kravhantering-db --local --file=-',
)

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
DELETE FROM requirement_versions WHERE id = 101;
DELETE FROM requirement_scenarios WHERE id IN (1, 2, 3);
DELETE FROM requirements WHERE id BETWEEN 1 AND 67;
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
  (1,  'INT', 'Integration',   'Krav relaterade till systemintegration och gränssnitt',             'owner-1', 9,  datetime('now'), datetime('now')),
  (2,  'SÄK', 'Säkerhet',     'Krav relaterade till informationssäkerhet och åtkomstkontroll',     'owner-2', 11, datetime('now'), datetime('now')),
  (3,  'PRE', 'Prestanda',    'Krav relaterade till systemets prestanda och svarstider',           'owner-1', 8,  datetime('now'), datetime('now')),
  (4,  'ANV', 'Användbarhet', 'Krav relaterade till användargränssnitt och användarupplevelse',    'owner-3', 7,  datetime('now'), datetime('now')),
  (5,  'LAG', 'Lagring',      'Krav relaterade till datalagring, backup och arkivering',           'owner-1', 8,  datetime('now'), datetime('now')),
  (6,  'BEH', 'Behörighet',   'Krav relaterade till behörigheter och åtkomstkontroll',             'owner-2', 7,  datetime('now'), datetime('now')),
  (7,  'IDN', 'Identitet',    'Krav relaterade till identitetshantering och autentisering',        'owner-2', 7,  datetime('now'), datetime('now')),
  (8,  'LOG', 'Loggning',     'Krav relaterade till loggning, spårbarhet och övervakning',         'owner-1', 8,  datetime('now'), datetime('now')),
  (9,  'DRF', 'Drift',        'Krav relaterade till driftsättning, underhåll och operativa rutiner','owner-3', 6,  datetime('now'), datetime('now')),
  (10, 'DAT', 'Data',         'Krav relaterade till datahantering, kvalitet och migration',        'owner-1', 6,  datetime('now'), datetime('now'));

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
  (32, 30, 1, 'Gränssnittet ska följa Sveriges myndigheters designmönster (utgått) [Version 1 testdata]', 'Manuell granskning mot designguiden genomförd [Version 1 testdata]', 1, 2, 13, 4, 0, datetime('now', '-60 days'), 'seed', datetime('now', '-56 days'), datetime('now', '-55 days'), datetime('now', '-40 days'));

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
  '-- Or use: npx tsx drizzle/seed.ts | wrangler d1 execute kravhantering-db --local --file=-',
)

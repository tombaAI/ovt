-- ═══════════════════════════════════════════════════════════════════════════
-- Synchronizace osobních dat z VT databáze (Excel vodTuristika_database.xlsx)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Doplnit CSK čísla a přezdívky pro nové členy ────────────────────────
UPDATE app.members SET csk_number = '559488', nickname = 'Bob' WHERE id = 161;
UPDATE app.members SET csk_number = '560637', nickname = 'Pilín' WHERE id = 162;
UPDATE app.members SET csk_number = '559651' WHERE id = 163;
UPDATE app.members SET csk_number = '001126' WHERE id = 164;
UPDATE app.members SET csk_number = '560782' WHERE id = 165;
UPDATE app.members SET csk_number = '556908', nickname = 'Claar' WHERE id = 166;
UPDATE app.members SET csk_number = '560645' WHERE id = 144;

-- ── 2. Osobní data pro všechny členy (párování přes csk_number) ─────────────

UPDATE app.members SET
        phone = '602839266',
        birth_date = '1994-10-28',
        birth_number = '941028/0407',
        gender = 'Muž'
    WHERE id = 44; -- CSK 559026

UPDATE app.members SET
        phone = '737003673',
        birth_date = '1964-01-19',
        birth_number = '640119/1731',
        gender = 'Muž'
    WHERE id = 71; -- Adam Chochola (CSK dle opravy v DB)

UPDATE app.members SET
        phone = '777877447',
        birth_date = '1986-07-23',
        birth_number = '860723/0005',
        gender = 'Muž',
        address = 'Školská 50, Kosoř'
    WHERE id = 45; -- CSK 556072

-- CSK 556121 (id=46): není v Excelu, přeskakuji
UPDATE app.members SET
        phone = '725314682',
        birth_date = '1957-04-18',
        birth_number = '570418/0053',
        gender = 'Muž'
    WHERE id = 48; -- CSK 556132

UPDATE app.members SET
        phone = '775238898',
        birth_date = '1988-08-28',
        birth_number = '885828/0156',
        gender = 'Žena',
        address = 'Hrudickova 2110/10, Praha 4'
    WHERE id = 52; -- CSK 559074

UPDATE app.members SET
        phone = '608456978',
        birth_date = '1991-05-19',
        birth_number = '910519/0105',
        gender = 'Muž'
    WHERE id = 53; -- CSK 556093

UPDATE app.members SET
        phone = '723402813',
        birth_date = '1971-03-11',
        birth_number = '710311/0003',
        gender = 'Muž'
    WHERE id = 54; -- CSK 556137

UPDATE app.members SET
        phone = '777855448',
        birth_date = '1974-09-05',
        birth_number = '740905/0264',
        gender = 'Muž',
        address = 'Kopřivnická 615, Praha 18'
    WHERE id = 55; -- CSK 556111

UPDATE app.members SET
        phone = '724102093',
        birth_date = '1983-08-18',
        birth_number = '830818/0254',
        gender = 'Muž'
    WHERE id = 56; -- CSK 556101

UPDATE app.members SET
        phone = '737233396',
        birth_date = '1972-12-24',
        birth_number = '726224/0304',
        gender = 'Žena',
        address = 'Španielova 1267, Praha 6'
    WHERE id = 57; -- CSK 560311

UPDATE app.members SET
        phone = '605246358',
        birth_date = '1992-01-20',
        birth_number = '920120/0162',
        gender = 'Muž'
    WHERE id = 58; -- CSK 556082

UPDATE app.members SET
        phone = '604373044',
        birth_date = '1962-01-06',
        birth_number = '620106/1339',
        gender = 'Muž'
    WHERE id = 59; -- CSK 556128

UPDATE app.members SET
        phone = '773474688',
        gender = 'Žena'
    WHERE id = 62; -- CSK 556086

UPDATE app.members SET
        phone = '736515346',
        gender = 'Žena'
    WHERE id = 63; -- CSK 560631

UPDATE app.members SET
        phone = '737233205',
        birth_date = '1974-05-21',
        birth_number = '740521/6797',
        gender = 'Muž',
        address = 'Španielova 1267, Praha 6'
    WHERE id = 66; -- CSK 560312

UPDATE app.members SET
        phone = '602185750',
        birth_date = '1988-03-02',
        birth_number = '885302/0759',
        gender = 'Žena'
    WHERE id = 69; -- CSK 559868

UPDATE app.members SET
        phone = '773080644',
        gender = 'Žena'
    WHERE id = 72; -- CSK 559014

UPDATE app.members SET
        phone = '603585978',
        birth_date = '1964-05-30',
        birth_number = '640530/0066',
        gender = 'Muž'
    WHERE id = 73; -- CSK 556107

UPDATE app.members SET
        phone = '722062484',
        birth_date = '2001-08-18',
        birth_number = '010818/0050',
        gender = 'Muž',
        todo_note = 'Zkontrolovat RČ — shoduje se s Vojtěchem Kopřivou (010818/0050), pravděpodobný překlep v evidenci VT.'
    WHERE id = 74; -- CSK 560639

UPDATE app.members SET
        phone = '731536172',
        birth_date = '1999-05-03',
        birth_number = '990523/0401',
        gender = 'Muž',
        address = 'Španielova 1267, Praha 6'
    WHERE id = 75; -- CSK 559013

UPDATE app.members SET
        phone = '603826397',
        birth_date = '1978-04-06',
        birth_number = '785406/0159',
        gender = 'Žena'
    WHERE id = 77; -- CSK 560111

UPDATE app.members SET
        phone = '739426282',
        birth_date = '1998-12-22',
        birth_number = '981222/0495',
        gender = 'Muž'
    WHERE id = 82; -- CSK 559018

UPDATE app.members SET
        phone = '602357897',
        birth_date = '1975-06-04',
        birth_number = '750604/0300',
        gender = 'Muž'
    WHERE id = 83; -- CSK 557189

UPDATE app.members SET
        phone = '604986016',
        gender = 'Muž'
    WHERE id = 84; -- CSK 557680

UPDATE app.members SET
        phone = '604112158',
        birth_date = '1979-07-02',
        birth_number = '790702/4389',
        gender = 'Muž'
    WHERE id = 86; -- CSK 557188

UPDATE app.members SET
        phone = '25988576',
        birth_date = '1984-07-12',
        birth_number = '840712/0216',
        gender = 'Muž'
    WHERE id = 88; -- CSK 556063

UPDATE app.members SET
        phone = '602224269',
        birth_date = '1951-02-23',
        birth_number = '510223/008',
        gender = 'Muž'
    WHERE id = 92; -- CSK 556116

UPDATE app.members SET
        phone = '722226963',
        birth_date = '2001-08-18',
        birth_number = '010818/0050',
        gender = 'Muž',
        todo_note = 'Zkontrolovat RČ — shoduje se s Lukášem Kopřivou (010818/0050), pravděpodobný překlep v evidenci VT.'
    WHERE id = 93; -- CSK 560640

UPDATE app.members SET
        phone = '731536173',
        birth_date = '2000-07-21',
        birth_number = '000721/0401',
        gender = 'Muž',
        address = 'Španielova 1267, Praha 6'
    WHERE id = 94; -- CSK 560313

UPDATE app.members SET
        phone = '776840647',
        gender = 'Muž'
    WHERE id = 96; -- CSK 556065

UPDATE app.members SET
        phone = '731546080',
        birth_date = '1945-02-13',
        birth_number = '450213/952',
        gender = 'Muž'
    WHERE id = 98; -- CSK 556138

UPDATE app.members SET
        phone = '602345627',
        birth_date = '1983-08-05',
        birth_number = '835805/2835',
        gender = 'Žena'
    WHERE id = 100; -- CSK 556108

UPDATE app.members SET
        phone = '731971195',
        birth_date = '1976-05-05',
        birth_number = '760505/0453',
        gender = 'Muž'
    WHERE id = 107; -- CSK 557191

UPDATE app.members SET
        phone = '731730974',
        birth_date = '1999-10-04',
        gender = 'Žena',
        address = 'Novohradecká 5, Praha 4'
    WHERE id = 109; -- CSK 557883

UPDATE app.members SET
        phone = '777589577',
        birth_date = '1981-09-21',
        birth_number = '815921/0169',
        gender = 'Žena'
    WHERE id = 112; -- CSK 556125

UPDATE app.members SET
        birth_date = '1966-10-05',
        birth_number = '661005/1602',
        gender = 'Muž'
    WHERE id = 115; -- CSK 556124

UPDATE app.members SET
        phone = '777172228',
        birth_date = '1978-03-22',
        birth_number = '780322/0095',
        gender = 'Muž'
    WHERE id = 116; -- CSK 557686

UPDATE app.members SET
        phone = '775211644',
        birth_date = '1985-06-28',
        birth_number = '855628/0051',
        gender = 'Žena'
    WHERE id = 118; -- CSK 557192

UPDATE app.members SET
        phone = '777572269',
        birth_date = '1986-04-14',
        birth_number = '860414/0160',
        gender = 'Muž'
    WHERE id = 121; -- CSK 556097

UPDATE app.members SET
        phone = '736225580',
        birth_date = '1999-12-20',
        birth_number = '991220/0188',
        gender = 'Muž',
        address = 'U Elektrárny 265, Vrané nad Vltavou'
    WHERE id = 130; -- CSK 559572

UPDATE app.members SET
        phone = '724101862',
        birth_date = '1978-07-09',
        birth_number = '780709/2469',
        gender = 'Muž'
    WHERE id = 133; -- CSK 560795

UPDATE app.members SET
        phone = '774540346',
        gender = 'Muž'
    WHERE id = 144; -- CSK 560645

UPDATE app.members SET
        phone = '736531382',
        birth_date = '1972-03-09',
        birth_number = '720309/0323',
        gender = 'Muž',
        address = 'U Háječku, 533'
    WHERE id = 161; -- CSK 559488

UPDATE app.members SET
        phone = '773235730',
        birth_date = '2006-10-08',
        birth_number = '061008/4464',
        gender = 'Muž',
        address = 'Jurkovičova , 970/10'
    WHERE id = 162; -- CSK 560637

UPDATE app.members SET
        phone = '777178758',
        birth_date = '1979-02-18',
        birth_number = '790218/0275',
        gender = 'Muž',
        address = 'Peroutkova, 2'
    WHERE id = 163; -- CSK 559651

UPDATE app.members SET
        phone = '723901190',
        birth_date = '2006-10-27',
        birth_number = '061027/4687',
        gender = 'Muž',
        address = 'Nad Zavážkou, 1206/1'
    WHERE id = 164; -- CSK 001126

UPDATE app.members SET
        phone = '736120037',
        birth_date = '2007-02-26',
        birth_number = '070226/4728',
        gender = 'Muž',
        address = 'Na smejkalce , 215e'
    WHERE id = 165; -- CSK 560782

UPDATE app.members SET
        phone = '602150727',
        birth_date = '1976-02-27',
        birth_number = '760227/4361',
        gender = 'Muž',
        address = 'Na Výspě , 1823/64'
    WHERE id = 166; -- CSK 556908

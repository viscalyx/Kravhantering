# Kravpaket ersätter kravversion vid publicering

Status: Antagen 2026-06-19.

Kravpaket representerar aktuellt medlemskap för krav i kravbiblioteket, inte
historik över vilka kravversioner som tidigare har ingått i paketet. Ett
kravpaket pekar på den kravversion som får användas, så att ett nyare utkast
kan förberedas utan att paketets aktuella innehåll ändras.

När en ny kravversion publiceras ersätter publiceringsflödet den tidigare
publicerade kravversionen i alla kravpaket där kravet används. Publiceringen
arkiverar föregångaren och flyttar paketmedlemskapet till den nya publicerade
kravversionen atomärt, utifrån de paketval som gäller för versionen som
publiceras.

Kravpaketskopplingar ska därför inte användas som historikmarkörer på
arkiverade föregångarversioner. Historik om tidigare paketmedlemskap hör hemma
i kravets versionhistorik, åtgärdslogg eller en framtida separat
historikmodell.

Arkivering utan efterträdare är ett annat fall. Då kan kravpaketskopplingen
ligga kvar för att visa att den arkiverade kravversionen har ingått i paketet,
men praktisk kravpaketsanvändning, till exempel urval till kravunderlag, ska
exkludera arkiverade kravversioner och bara använda publicerade krav.

Kravbibliotekets kravpaketsfilter är ett annat lässammanhang. Där fungerar
kravpaket som ett sökfilter tillsammans med listans statusfilter. Om användaren
uttryckligen inkluderar arkiverade krav i kravbiblioteket ska historiska
paketkopplingar därför kunna ge träff på arkiverade krav.

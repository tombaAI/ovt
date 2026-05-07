/**
 * Převede křestní jméno do 5. pádu (vokativu) pro české oslovení.
 * Pravidla jsou heuristická — pokrývají běžná česká jména.
 */
export function vocative(name: string): string {
    // -něk → -ňku  (Zbyněk→Zbyňku, Zdeněk→Zdeňku)
    if (/něk$/.test(name))           return name.replace(/něk$/, "ňku");
    // -ch → +u  (Vojtěch→Vojtěchu)
    if (/ch$/.test(name))            return name + "u";
    // Ženská: -a/-á → -o  (Jana→Jano, Klára→Kláro)
    if (/[aá]$/.test(name))          return name.slice(0, -1) + "o";
    // -e/-í → beze změny  (Marie, Jiří, René)
    if (/[eí]$/.test(name))          return name;
    // -o → beze změny  (Hugo, Otto)
    if (/o$/.test(name))             return name;
    // Měkké hlásky a -j → +i  (Tomáš→Tomáši, Ondřej→Ondřeji, Luboš→Luboši)
    if (/[šžčřj]$/.test(name))       return name + "i";
    // -[souhláska]ek → pohyblivé e, odpadá  (Vašek→Vašku, Marek→Marku, Radek→Radku)
    if (/[^aeiouáéíóúůý]ek$/.test(name)) return name.slice(0, -2) + "ku";
    // -k → +u  (Dominik→Dominiku, Patrik→Patriku)
    if (/k$/.test(name))             return name + "u";
    // Ostatní → +e  (Petr→Petre, Jan→Jane, Pavel→Pavle)
    return name + "e";
}

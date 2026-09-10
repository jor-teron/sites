/* nei-dict — XOBDO-backed search (API version) */
(function () {
  const API = "https://xobdo.org/2025-web/api/wordsalpha.php";

  const LANGS = [
    { id: 1, name: "English", script: "latin" },
    { id: 15, name: "Dimasa", script: "latin" },
    { id: 10, name: "Karbi", script: "latin" },
    { id: 6, name: "Garo", script: "latin" },
    { id: 14, name: "Nagamese", script: "latin" },
    { id: 4, name: "Mising", script: "latin" },
    { id: 7, name: "Meeteilon", script: "latin" },
    { id: 5, name: "Khasi", script: "latin" },
    { id: 13, name: "Hmar", script: "latin" },
    { id: 9, name: "Mizo", script: "latin" },
    { id: 24, name: "Rabha", script: "latin" },
    { id: 17, name: "Ao", script: "latin" },
    { id: 31, name: "Santali", script: "latin" },
    { id: 25, name: "Tiwa", script: "latin" },
    { id: 37, name: "Singpho", script: "latin" },
    { id: 35, name: "TAI-Turung", script: "latin" },
    { id: 40, name: "Adi Bokar", script: "latin" },
    { id: 34, name: "TAI-Khamti", script: "latin" },
    { id: 39, name: "Paite", script: "latin" },
    { id: 12, name: "Kok-Borok", script: "latin" },
    { id: 19, name: "TAI-Ahom", script: "latin" },
  ];

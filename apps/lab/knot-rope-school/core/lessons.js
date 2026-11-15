// Lesson registry. Individual lesson files register themselves through this API.
(function () {
  const api = window.KRS = window.KRS || {};
  api.lessons = [];
  api.addLesson = function (lesson) {
    if (!lesson || !lesson.id || api.lessons.some(item => item.id === lesson.id)) return;
    api.lessons.push(lesson);
    api.lessons.sort((a, b) => a.number.localeCompare(b.number));
  };
})();

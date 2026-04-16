export const TODOIST_API_BASE = "https://api.todoist.com/api/v1";
export const CHARACTER_LIMIT = 25000;
export var ResponseFormat;
(function (ResponseFormat) {
    ResponseFormat["MARKDOWN"] = "markdown";
    ResponseFormat["JSON"] = "json";
})(ResponseFormat || (ResponseFormat = {}));
export var TaskPriority;
(function (TaskPriority) {
    TaskPriority[TaskPriority["NORMAL"] = 1] = "NORMAL";
    TaskPriority[TaskPriority["MEDIUM"] = 2] = "MEDIUM";
    TaskPriority[TaskPriority["HIGH"] = 3] = "HIGH";
    TaskPriority[TaskPriority["URGENT"] = 4] = "URGENT";
})(TaskPriority || (TaskPriority = {}));
//# sourceMappingURL=constants.js.map
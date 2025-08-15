// 全域設定
const SCRIPT_PROPERTY_KEY = 'homeworkData';
const FORM_ID_KEY = 'formId';

// 學生人數與班級設定
const CLASSES = ['中一', '中二', '中三', '中四', '中五', '中六'];
const SUB_CLASSES = ['A', 'B', 'C', 'D'];
const STUDENTS_PER_CLASS = 33;

// 分年級的科目列表 (無變動)
const SUBJECTS_BY_GRADE = {
    "F1_F2": ["中國語文", "普通話", "英國語文", "數學", "綜合科學", "公民、經濟與社會", "STREAM", "地理", "中國歷史", "歷史", "資訊及通訊科技", "家政", "設計與科技", "音樂", "視覺藝術", "宗教", "體育", "生活教育"],
    "F3": ["中國語文", "普通話", "英國語文", "數學", "物理", "化學", "生物", "公民、經濟與社會", "地理", "中國歷史", "歷史", "資訊及通訊科技", "家政", "設計與科技", "音樂", "視覺藝術", "宗教", "體育", "生活教育"],
    "F4_F6": ["中國語文", "英國語文", "數學", "物理", "化學", "生物", "公民、經濟與社會", "地理", "中國歷史", "歷史", "資訊及通訊科技", "宗教", "體育", "生活教育", "中國文學", "企業、會計與財務概論", "數學（單元一）", "數學（單元二）", "經濟"]
};

// ✨ NEW: 學生名單 PDF 連結
const STUDENT_LIST_URLS = {
    '中一': 'xxx',
    '中二': 'xxx',
    '中三': 'xxx',
    '中四': 'xxx',
    '中五': 'xxx',
    '中六': 'xxx'
};

// 根據年級獲取對應的科目列表
function getSubjectsForGrade(grade) {
    if (grade === '中一' || grade === '中二') return SUBJECTS_BY_GRADE.F1_F2;
    if (grade === '中三') return SUBJECTS_BY_GRADE.F3;
    if (['中四', '中五', '中六'].includes(grade)) return SUBJECTS_BY_GRADE.F4_F6;
    return [];
}

// Web App 主進入點
function doGet(e) {
    const template = HtmlService.createTemplateFromFile('index');
    template.grade = (e && e.parameter && e.parameter.grade) ? e.parameter.grade : null;
    return template.evaluate()
        .setTitle('缺交功課管理平台')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * 【步驟 1】請先執行此函式進行首次設定
 */
function RUN_THIS_FIRST_TO_SETUP() {
    const formId = createGradedHomeworkForm();
    if (formId) {
        PropertiesService.getScriptProperties().setProperty(FORM_ID_KEY, formId);
        const triggers = ScriptApp.getProjectTriggers();
        triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
        ScriptApp.newTrigger('onFormSubmit')
            .forForm(FormApp.openById(formId))
            .onFormSubmit()
            .create();
        Logger.log('✅ 全新批量輸入表單 (V6) 已成功建立！');
        RUN_THIS_TO_GET_FORM_URL();
    }
}

/**
 * 【步驟 2】隨時執行此函式以取得 Google Form 網址
 */
function RUN_THIS_TO_GET_FORM_URL() {
    const formId = PropertiesService.getScriptProperties().getProperty(FORM_ID_KEY);
    if (formId) {
        try {
            const formUrl = FormApp.openById(formId).getPublishedUrl();
            Logger.log('******************************************************************');
            Logger.log('***** GOOGLE FORM 網址 (請複製此連結給老師/科長使用) *****');
            Logger.log(formUrl);
            Logger.log('******************************************************************');
        } catch (e) { Logger.log('❌ 錯誤：找不到表單。請重新執行 "RUN_THIS_FIRST_TO_SETUP"。'); }
    } else { Logger.log('⚠️ 提示：尚未建立表單。請先執行 "RUN_THIS_FIRST_TO_SETUP"。'); }
}

/**
 * 建立批量輸入表單
 */
function createGradedHomeworkForm() {
    try {
        const form = FormApp.create('缺交功課記錄表');
        form.setDescription('請先選擇年級，然後填寫共同資訊，最後勾選所有欠交的學生學號即可一次提交。');
        const gradeSelectionItem = form.addListItem().setTitle('請選擇年級').setRequired(true);
        const sections = {};
        CLASSES.forEach(grade => {
            sections[grade] = form.addPageBreakItem().setTitle(`${grade} 學生資料`);
            addStudentInfoToSection(form, getSubjectsForGrade(grade));
            sections[grade].setGoToPage(FormApp.PageNavigationType.SUBMIT);
        });
        const choices = CLASSES.map(grade => gradeSelectionItem.createChoice(grade, sections[grade]));
        gradeSelectionItem.setChoices(choices);
        return form.getId();
    } catch (e) {
        Logger.log('建立分級表單時發生錯誤: %s', e.toString());
        return null;
    }
}

/**
 * 輔助函式，學號欄位為「核取方塊」
 */
function addStudentInfoToSection(form, subjects) {
    form.addListItem().setTitle('班別').setChoiceValues(SUB_CLASSES).setRequired(true);
    form.addListItem().setTitle('科目').setChoiceValues(subjects).setRequired(true);
    form.addTextItem().setTitle('功課名稱').setRequired(true);
    form.addDateItem().setTitle('缺交日期').setRequired(true);
    const studentChoices = Array.from({ length: STUDENTS_PER_CLASS }, (_, i) => String(i + 1));
    form.addCheckboxItem()
        .setTitle('請勾選欠交功課的學生學號')
        .setChoiceValues(studentChoices)
        .setRequired(true);
}


/**
 * 處理批量學號的 onFormSubmit
 */
function onFormSubmit(e) {
    const itemResponses = e.response.getItemResponses();
    let responseData = {};
    itemResponses.forEach(itemResponse => {
        const title = itemResponse.getItem().getTitle();
        responseData[title] = itemResponse.getResponse();
    });

    const studentNumbers = responseData['請勾選欠交功課的學生學號'];
    if (!studentNumbers || studentNumbers.length === 0) {
        Logger.log('沒有勾選任何學生，已略過此提交。');
        return;
    }

    const allData = getHomeworkData();
    const commonData = {
        class: responseData['請選擇年級'],
        subClass: responseData['班別'],
        subject: responseData['科目'],
        homeworkName: responseData['功課名稱'],
        date: new Date(responseData['缺交日期']).toISOString().slice(0, 10)
    };

    for (const studentId of studentNumbers) {
        const newData = {
            ...commonData,
            id: Utilities.getUuid(),
            timestamp: new Date().toISOString(),
            studentId: studentId
        };
        const isDuplicate = allData.some(record =>
            record.date === newData.date &&
            record.class === newData.class &&
            record.subClass === newData.subClass &&
            record.studentId === newData.studentId &&
            record.subject === newData.subject &&
            record.homeworkName === newData.homeworkName
        );
        if (!isDuplicate) {
            allData.push(newData);
        } else {
            Logger.log(`偵測到學生 ${studentId} 的重複提交，已略過。`);
        }
    }
    saveHomeworkData(allData);
}

/**
 * ✨ UPDATED: 更名為 getPlatformData 並加入更多資訊
 */
function getPlatformData(grade) {
    const allRecords = getHomeworkData();
    const gradeRecords = allRecords.filter(r => r.class === grade);
    const formId = PropertiesService.getScriptProperties().getProperty(FORM_ID_KEY);
    let formUrl = '#';
    if (formId) {
        try { formUrl = FormApp.openById(formId).getPublishedUrl(); } catch(e) {}
    }

    return {
        records: gradeRecords,
        filters: {
            subClasses: SUB_CLASSES,
            subjects: getSubjectsForGrade(grade)
        },
        // ✨ NEW: 回傳額外資訊
        studentListUrl: STUDENT_LIST_URLS[grade] || '#',
        formUrl: formUrl
    };
}

// --- 其他輔助函式 (無變動) ---
function getHomeworkData() { try { const d = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEY); return d ? JSON.parse(d) : []; } catch (e) { return []; } }
function saveHomeworkData(data) { PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_KEY, JSON.stringify(data)); }
function deleteRecord(id) { try { let d = getHomeworkData(); const c = d.length; d = d.filter(r => r.id !== id); if (d.length < c) { saveHomeworkData(d); return { success: true, message: '紀錄已刪除' }; } return { success: false, message: '找不到紀錄' }; } catch (e) { return { success: false, message: '刪除時發生錯誤: ' + e.toString() }; } }

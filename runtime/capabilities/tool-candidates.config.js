/**
 * 最小白名单：tool_id → 扫描识别信息（不含用户手写路径）。
 */

/** @type {Record<string, { display: { 'zh-CN': string; 'en-US': string }; exe: string[]; caps: string[] }>} */
const TOOL_PROFILES = {
  excel: {
    display: { "zh-CN": "Microsoft Excel", "en-US": "Microsoft Excel" },
    exe: ["EXCEL.EXE"],
    caps: ["spreadsheet"]
  },
  wps_spreadsheet: {
    display: { "zh-CN": "WPS 表格", "en-US": "WPS Spreadsheets" },
    exe: ["ET.EXE", "WPS.EXE"],
    caps: ["spreadsheet"]
  },
  libreoffice_calc: {
    display: { "zh-CN": "LibreOffice Calc", "en-US": "LibreOffice Calc" },
    exe: ["SCalc.exe", "soffice.bin"],
    caps: ["spreadsheet"]
  },
  word: {
    display: { "zh-CN": "Microsoft Word", "en-US": "Microsoft Word" },
    exe: ["WINWORD.EXE"],
    caps: ["document_editing"]
  },
  wps_writer: {
    display: { "zh-CN": "WPS 文字", "en-US": "WPS Writer" },
    exe: ["WPS.EXE", "wps.exe"],
    caps: ["document_editing"]
  },
  powerpoint: {
    display: { "zh-CN": "Microsoft PowerPoint", "en-US": "Microsoft PowerPoint" },
    exe: ["POWERPNT.EXE"],
    caps: ["presentation"]
  },
  wps_presentation: {
    display: { "zh-CN": "WPS 演示", "en-US": "WPS Presentation" },
    exe: ["WPP.EXE", "WPS.EXE"],
    caps: ["presentation"]
  },
  capcut: {
    display: { "zh-CN": "剪映", "en-US": "CapCut" },
    exe: ["CapCut.exe", "JianyingPro.exe"],
    caps: ["video_editing"]
  },
  premiere: {
    display: { "zh-CN": "Adobe Premiere Pro", "en-US": "Adobe Premiere Pro" },
    exe: ["Adobe Premiere Pro.exe", "Premiere Pro.exe"],
    caps: ["video_editing"]
  },
  photoshop: {
    display: { "zh-CN": "Adobe Photoshop", "en-US": "Adobe Photoshop" },
    exe: ["Photoshop.exe"],
    caps: ["image_editing"]
  }
};

function listProfiles() {
  return TOOL_PROFILES;
}

module.exports = { TOOL_PROFILES, listProfiles };

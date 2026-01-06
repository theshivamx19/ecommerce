const deeplTranslateService = require("../../services/DeeplTranslate/deeplTranslateService");
const AppError = require("../../utils/AppError");

const deeplTranslateController = async (req, res, next) => {
    try {
        const { texts, targetLanguage } = req.body;

        if (!Array.isArray(texts)) {
            throw new AppError("Text must be an array", 400);
        }

        const translationTargetLanguages = {
            AR: "Arabic",
            BG: "Bulgarian",
            CS: "Czech",
            DA: "Danish",
            DE: "German",
            EL: "Greek",
            EN: "English (unspecified variant)",
            "EN-GB": "English (British)",
            "EN-US": "English (American)",
            ES: "Spanish",
            "ES-419": "Spanish (Latin American)",
            ET: "Estonian",
            FI: "Finnish",
            FR: "French",
            HE: "Hebrew",
            HU: "Hungarian",
            ID: "Indonesian",
            IT: "Italian",
            JA: "Japanese",
            KO: "Korean",
            LT: "Lithuanian",
            LV: "Latvian",
            NB: "Norwegian Bokmål",
            NL: "Dutch",
            PL: "Polish",
            PT: "Portuguese (unspecified variant)",
            "PT-BR": "Portuguese (Brazilian)",
            "PT-PT": "Portuguese (European)",
            RO: "Romanian",
            RU: "Russian",
            SK: "Slovak",
            SL: "Slovenian",
            SV: "Swedish",
            TH: "Thai",
            TR: "Turkish",
            UK: "Ukrainian",
            VI: "Vietnamese",
            ZH: "Chinese (unspecified variant)",
            "ZH-HANS": "Chinese (Simplified)",
            "ZH-HANT": "Chinese (Traditional)"
        };
        const lang = targetLanguage.toUpperCase()
        if (!translationTargetLanguages[lang]) {
            throw new AppError("Invalid target language", 400);
        }

        const result = await deeplTranslateService(texts, lang);
        // const parsedResult = JSON.parse(result)
        return res.status(200).json({
            success: true,
            message: `Translation successful to ${translationTargetLanguages[lang]}`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = deeplTranslateController
const DeepL = require("deepl-node");
const AppError = require("../../utils/AppError");
const { DEEPL_AUTH_KEY } = process.env;



// const deeplTranslateService = async (text, targetLanguage) => {

//     const { title, description, ...rest } = text
//     const data = {
//         title,
//         description
//     }
//     const translated = {};
//     const deeplClient = new DeepL.DeepLClient(DEEPL_AUTH_KEY);
//     for ([key, value] of Object.entries(data)) {
//         const result = await deeplClient.translateText(value, null, targetLanguage);
//         translated[key] = result.text;
//     }
//     const finalResult = {
//         title: translated.title,
//         description: translated.description,
//         ...rest
//     }

//     return finalResult;
// };

const deeplTranslateService = async (texts, targetLanguage) => {
    const deeplClient = new DeepL.DeepLClient(DEEPL_AUTH_KEY);

    return Promise.all(
        texts.map(async (text) => {
            const { title, description, ...rest } = text;
            const translations = await Promise.all([
                title
                    ? deeplClient.translateText(title, null, targetLanguage)
                    : null,
                description
                    ? deeplClient.translateText(description, null, targetLanguage)
                    : null
            ]);

            return {
                title: translations[0]?.text || title,
                description: translations[1]?.text || description,
                ...rest
            };
        })
    );
};


module.exports = deeplTranslateService
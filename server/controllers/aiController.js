import Resume from "../models/Resume.js";
import ai from "../configs/ai.js";
import { PDFParse } from "pdf-parse";
import fs from "fs";

const getModelCandidates = () => {
    const models = [
        process.env.OPENAI_MODEL,
        "gemini-2.0-flash",
        "gpt-4o-mini",
    ].filter(Boolean);

    return [...new Set(models)];
};

const createChatCompletionWithFallback = async (messages, options = {}) => {
    const modelCandidates = getModelCandidates();
    let lastError;

    for (const model of modelCandidates) {
        try {
            return await ai.chat.completions.create({
                model,
                messages,
                ...options,
            });
        } catch (error) {
            lastError = error;
            if (error?.status !== 403) {
                throw error;
            }
        }
    }

    throw lastError;
};

const getAIErrorMessage = (error) => {
    if (error?.status === 403) {
        return "AI request was denied by provider (403). Check your AI key permissions/model access and try again.";
    }
    if (error?.status === 429) {
        return "AI provider quota/rate limit reached (429).";
    }
    return error?.message || "AI request failed";
};

const extractQuotedContent = (value = "") => {
    const match = value.match(/"([\s\S]+)"/);
    return match?.[1]?.trim() || value.trim();
};

const normalizeSentences = (text = "") => {
    return text
        .replace(/\s+/g, " ")
        .split(/[.!?]+/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const fallbackProfessionalSummary = (userContent = "") => {
    const source = extractQuotedContent(userContent);
    const parts = normalizeSentences(source);

    if (!parts.length) {
        return "Motivated professional with strong problem-solving ability, effective communication, and a focus on delivering measurable business impact.";
    }

    const first = parts[0];
    const second = parts[1];

    if (second) {
        return `${first}. ${second}.`;
    }

    return `${first}. Skilled in collaboration, continuous learning, and delivering high-quality outcomes aligned with team goals.`;
};

const fallbackJobDescription = (userContent = "") => {
    const source = userContent
        .replace(/^enhance this job description\s*/i, "")
        .replace(/\s*fro the position of[\s\S]*$/i, "")
        .trim();
    const parts = normalizeSentences(source);

    if (!parts.length) {
        return "Collaborated with cross-functional teams to deliver key initiatives, improve process efficiency, and maintain high quality standards across releases.";
    }

    return `${parts[0]}. ${parts[1] || "Contributed to measurable improvements through ownership, execution, and continuous optimization."}.`;
};

const normalizeExtractedResumeData = (rawData = {}) => {
    const normalized = { ...rawData };

    // Some model outputs use `project` instead of schema field `projects`.
    if (!Array.isArray(normalized.projects) && Array.isArray(normalized.project)) {
        normalized.projects = normalized.project;
    }

    delete normalized.project;
    return normalized;
};

const fallbackResumeFromText = (resumeText = "") => {
    const lines = resumeText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    return {
        professional_summary: lines.slice(0, 2).join(" ").slice(0, 350),
        skills: [],
        personal_info: {
            full_name: lines[0] || "",
            profession: "",
            email: "",
            phone: "",
            location: "",
            linkedin: "",
            website: "",
            image: "",
        },
        experience: [],
        projects: [],
        education: [],
    };
};

// controller for enhancing a resume's professional summary



// POST: /api/ai/enhance-pro-sum
export const enhanceProfessionalSummary = async (req, res) => {
    const userContent = req.body?.userContent;
    try {
    if(!userContent){
        return res.status(400).json({message: 'Missing required fields'})
    }
      const response = await createChatCompletionWithFallback([
        {   role: "system",
            content: "You are an expert in resume writing Your task is to enhance the professional summary of a resume. The summary should be 1-2 sentences also highlighting key skills, ezperience, and career objectives. MAke it compelling and ATS-friendly. and only return text no options or anything else." 
        },
        {
            role: "user",
            content: userContent,
        },
    ])

        const enhancedContent = response.choices[0].message.content;
        return res.status(200).json({enhancedContent})
} catch (error) {
        if (error?.status === 403 || error?.status === 429) {
            const enhancedContent = fallbackProfessionalSummary(userContent);
            return res.status(200).json({
                enhancedContent,
                fallback: true,
                message: getAIErrorMessage(error),
            });
        }
        return res.status(400).json({message: getAIErrorMessage(error)})
    }
}


// controller for enhancing a resume's job description
// POST: /api/ai/enhance-job-desc
export const enhanceJobDescription = async (req, res) => {
const userContent = req.body?.userContent;
try {
    if(!userContent){
        return res.status(400).json({message: 'Missing required fields'})
    }

    const response = await createChatCompletionWithFallback([
            { role: "system", 
                content: "You are an expert in resume writing. Your task is to enhance the job description of a resume.The job description should be only in 1-2 sentence also highlighting key responsibilities and achievements. USe action verbs and quantifiable results wher possible. Make it ATS-friendly. and only return text no options or anything else. "
            },
            {
                role: "user",
                content: userContent,
            },
        ])
        const enhancedContent = response.choices[0].message.content;
        return res.status(200).json({enhancedContent})
   } catch (error) {
        if (error?.status === 403 || error?.status === 429) {
            const enhancedContent = fallbackJobDescription(userContent);
            return res.status(200).json({
                enhancedContent,
                fallback: true,
                message: getAIErrorMessage(error),
            });
        }
        return res.status(400).json({message: getAIErrorMessage(error)})
  }
}

// controller for uploading a resume to the database
// POST: /api/ai/upload-resume
export const uploadResume = async (req, res) => {
try {
    
    const { title } = req.body;
    const userID = req.userId;
    const file = req.file;

    if(!file){
        return res.status(400).json({message: 'Please upload a resume file'})
    }

    if(!title){
        return res.status(400).json({message: 'Please provide a title'})
    }

    const fileBuffer = fs.readFileSync(file.path);
    const parser = new PDFParse({ data: fileBuffer });
    let resumeText;
    try {
        const textResult = await parser.getText();
        resumeText = textResult.text;
    } finally {
        await parser.destroy();
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    }

    if(!resumeText){
        return res.status(400).json({message: 'Could not extract text from PDF'})
    }

    const systemPromt = "Your are an expert AI Agent to extract data from resume."

    const userPrompt = `extract data from this resume: ${resumeText} 
    
    Provide data in the following JSON format with no additional text before or afer:

    {
     professional_summary: { type: String, default: ''},
    skills: [{ type: String }],
    personal_info: {
        image: {type: String, default: ''},
        full_name: {type: String, default: ''},
        profession: {type: String, default: ''},
        email: {type: String, default: ''},
        phone: {type: String, default: ''},
        location: {type: String, default: ''},
        linkedin: {type: String, default: ''},
        website: {type: String, default: ''},

    },
    experience: [
        {
            company: { type: String },
            position: { type: String },
            start_date: { type: String },
            end_date: { type: String },
            description: { type: String },
            is_current: { type: String },
        }
    ],
    project: [
        {
           name: { type: String },
            type: { type: String },            
            description: { type: String },
        }
    ],
    education: [
        {
            institution: { type: String },
            degree: { type: String },
            field: { type: String },
            graduation_date: { type: String },
            gpa: { type: String },
        }
    ],
    }
    `;

    try {
        const response = await createChatCompletionWithFallback(
            [
                {
                    role: "system",
                    content: systemPromt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
            { response_format: { type: "json_object" } }
        );

        const extractedData = response.choices[0].message.content;
        const parsedData = normalizeExtractedResumeData(JSON.parse(extractedData));
        const newResume = await Resume.create({ userId: userID, title, ...parsedData });

        return res.json({ resumeId: newResume._id });
    } catch (error) {
        if (error?.status === 403 || error?.status === 429) {
            const fallbackData = fallbackResumeFromText(resumeText);
            const newResume = await Resume.create({ userId: userID, title, ...fallbackData });

            return res.status(200).json({
                resumeId: newResume._id,
                fallback: true,
                message: getAIErrorMessage(error),
            });
        }

        return res.status(400).json({ message: error.message });
    }
   } catch (error) {
        return res.status(400).json({message: error.message})
  }
}

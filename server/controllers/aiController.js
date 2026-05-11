import Resume from "../models/Resume.js";
import ai from "../configs/ai.js";
import { PDFParse } from "pdf-parse";
import fs from "fs";

// controller for enhancing a resume's professional summary



// POST: /api/ai/enhance-pro-sum
export const enhanceProfessionalSummary = async (req, res) => {
    try {
        const { userContent } = req.body;
    
    if(!userContent){
        return res.status(400).json({message: 'Missing required fields'})
    }
      const response = await ai.chat.completions.create({
             model: process.env.OPENAI_MODEL,
    messages: [
        {   role: "system",
            content: "You are an expert in resume writing Your task is to enhance the professional summary of a resume. The summary should be 1-2 sentences also highlighting key skills, ezperience, and career objectives. MAke it compelling and ATS-friendly. and only return text no options or anything else." 
        },
        {
            role: "user",
            content: userContent,
        },
    ],
        })

        const enhancedContent = response.choices[0].message.content;
        return res.status(200).json({enhancedContent})
} catch (error) {
        return res.status(400).json({message: error.message})
    }
}


// controller for enhancing a resume's job description
// POST: /api/ai/enhance-job-desc
export const enhanceJobDescription = async (req, res) => {
try {
    const { userContent } = req.body;

    if(!userContent){
        return res.status(400).json({message: 'Missing required fields'})
    }

    const response = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
            { role: "system", 
                content: "You are an expert in resume writing. Your task is to enhance the job description of a resume.The job description should be only in 1-2 sentence also highlighting key responsibilities and achievements. USe action verbs and quantifiable results wher possible. Make it ATS-friendly. and only return text no options or anything else. "
            },
            {
                role: "user",
                content: userContent,
            },
        ],
      })
        const enhancedContent = response.choices[0].message.content;
        return res.status(200).json({enhancedContent})
   } catch (error) {
        return res.status(400).json({message: error.message})
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
    }

    fs.unlinkSync(file.path);

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

    const response = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
            { role: "system", 
                content: systemPromt },
            
            {
                role: "user",
                content: userPrompt,
            },
        ],
        response_format: {type: 'json_object'}
      })
        const extractedData = response.choices[0].message.content;
        const parsedData = JSON.parse(extractedData)
        const newResume = await Resume.create({userId: userID, title, ...parsedData})

        res.json({resumeId: newResume._id})
   } catch (error) {
        return res.status(400).json({message: error.message})
  }
}

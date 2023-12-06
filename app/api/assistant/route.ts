import { experimental_AssistantResponse } from "ai";
import OpenAI from "openai";
import { MessageContentText } from "openai/resources/beta/threads/messages/messages";
import { env } from "@/env.mjs";
import { NextRequest } from "next/server";
import { z } from "zod";
import { zfd } from "zod-form-data";

const schema = zfd.formData({
	threadId: z.string().or(z.undefined()),
	message: zfd.text(),
	file: z.instanceof(Blob)
});

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY || ""
});
export const runtime = "edge";

export async function POST(req: NextRequest) {
	// Parse the request body
	const input = await req.formData();

	const data = schema.parse(input);

	const file = new File([data.file], "file", { type: data.file.type });

	const threadId = Boolean(data.threadId)
		? data.threadId!
		: (await openai.beta.threads.create()).id;

	let openAiFile: OpenAI.Files.FileObject | null = null;

	if (data.file.size > 0) {
		openAiFile = await openai.files.create({
			file,
			purpose: "assistants"
		});
	}

	const messageData = {
		role: "user" as "user",
		content: data.message,
		file_ids: openAiFile ? [openAiFile.id] : undefined
	};

	// Add a message to the thread
	const createdMessage = await openai.beta.threads.messages.create(
		threadId,
		messageData
	);

	return experimental_AssistantResponse(
		{ threadId, messageId: createdMessage.id },
		async ({ threadId, sendMessage }) => {
			// Run the assistant on the thread
			const run = await openai.beta.threads.runs.create(threadId, {
				assistant_id:
					env.OPENAI_ASSISTANT_ID ??
					(() => {
						throw new Error("ASSISTANT_ID is not set");
					})()
			});

			async function waitForRun(run: OpenAI.Beta.Threads.Runs.Run) {
				// Poll for status change
				while (run.status === "queued" || run.status === "in_progress") {
					// delay for 500ms
					await new Promise((resolve) => setTimeout(resolve, 500));

					run = await openai.beta.threads.runs.retrieve(threadId, run.id);
				}

				// Check the run status
				if (
					run.status === "cancelled" ||
					run.status === "cancelling" ||
					run.status === "failed" ||
					run.status === "expired"
				) {
					throw new Error(run.status);
				}
			}

			await waitForRun(run);

			// Get new thread messages (after our message)
			const responseMessages = (
				await openai.beta.threads.messages.list(threadId, {
					after: createdMessage.id,
					order: "asc"
				})
			).data;

			// Send the messages
			for (const message of responseMessages) {
				sendMessage({
					id: message.id,
					role: "assistant",
					content: message.content.filter(
						(content) => content.type === "text"
					) as Array<MessageContentText>
				});
			}
		}
	);
}

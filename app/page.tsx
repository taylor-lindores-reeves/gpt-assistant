"use client";

import { Button } from "@/components/button";
import { Icons } from "@/components/icons";
import { Input } from "@/components/input";
import { readDataStream } from "@/lib/read-data-stream";
import { AssistantStatus, Message } from "ai/react";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

const roleToColorMap: Record<Message["role"], string> = {
	system: "lightred",
	user: "white",
	function: "lightblue",
	assistant: "lightgreen"
};

const DotAnimation = () => {
	const dotVariants = {
		initial: { opacity: 0 },
		animate: { opacity: 1, transition: { duration: 0.5 } },
		exit: { opacity: 0, transition: { duration: 0.5 } }
	};

	// Stagger children animations
	const containerVariants = {
		initial: { transition: { staggerChildren: 0 } },
		animate: { transition: { staggerChildren: 0.5, staggerDirection: 1 } },
		exit: { transition: { staggerChildren: 0.5, staggerDirection: 1 } }
	};

	const [key, setKey] = useState(0);

	// ...
	return (
		<motion.div
			key={key}
			initial="initial"
			animate="animate"
			exit="exit"
			className="flex gap-x-0.5 -ml-1"
			variants={containerVariants}
			onAnimationComplete={() => setKey((prevKey) => prevKey + 1)}
		>
			{[...Array(3)].map((_, i) => (
				<motion.span key={i} variants={dotVariants}>
					.
				</motion.span>
			))}
		</motion.div>
	);
};

const Chat = () => {
	const prompt = "Summarise the research paper...";
	const [messages, setMessages] = useState<Message[]>([]);
	const [message, setMessage] = useState<string>(prompt);
	const [file, setFile] = useState<File | undefined>(undefined);
	const [threadId, setThreadId] = useState<string>("");
	const [error, setError] = useState<unknown | undefined>(undefined);
	const [status, setStatus] = useState<AssistantStatus>("awaiting_message");
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleFormSubmit = async (e: FormEvent) => {
		e.preventDefault();

		setStatus("in_progress");

		setMessages((messages: Message[]) => [
			...messages,
			{ id: "", role: "user" as "user", content: message! }
		]);

		const formData = new FormData();
		formData.append("message", message as string);
		formData.append("threadId", threadId);
		formData.append("file", file as File);

		const result = await fetch("/api/assistant", {
			method: "POST",
			body: formData
		});

		setFile(undefined);

		if (result.body == null) {
			throw new Error("The response body is empty.");
		}

		try {
			for await (const { type, value } of readDataStream(
				result.body.getReader()
			)) {
				switch (type) {
					case "assistant_message": {
						setMessages((messages: Message[]) => [
							...messages,
							{
								id: value.id,
								role: value.role,
								content: value.content[0].text.value
							}
						]);
						break;
					}
					case "assistant_control_data": {
						setThreadId(value.threadId);
						setMessages((messages: Message[]) => {
							const lastMessage = messages[messages.length - 1];
							lastMessage.id = value.messageId;
							return [...messages.slice(0, messages.length - 1), lastMessage];
						});
						break;
					}
					case "error": {
						setError(value);
						break;
					}
				}
			}
		} catch (error) {
			setError(error);
		}

		setStatus("awaiting_message");
	};

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		setFile(file);
	};

	const handleMessageChange = (e: ChangeEvent<HTMLInputElement>) => {
		setMessage(e.target.value);
	};

	const handleOpenFileExplorer = () => {
		fileInputRef.current?.click();
	};

	return (
		<main className="flex min-h-screen flex-col p-24">
			<div className="flex flex-col w-full max-w-xl mx-auto stretch">
				<h1 className="text-3xl text-zinc-100 font-extrabold pb-4">
					Research Paper Summariser 🤖
				</h1>
				{error != null && (
					<div className="relative bg-red-500 text-white px-6 py-4 rounded-md">
						<span className="block sm:inline">
							Error: {(error as any).toString()}
						</span>
					</div>
				)}

				{messages.map((m: Message) => (
					<div
						key={m.id}
						className="whitespace-pre-wrap"
						style={{ color: roleToColorMap[m.role] }}
					>
						<strong>{`${m.role}: `}</strong>
						<ReactMarkdown>{m.content}</ReactMarkdown>
						<br />
						<br />
					</div>
				))}

				{status === "in_progress" && (
					<span className="text-white flex gap-x-2">
						<Icons.spinner className="animate-spin w-5 h-5" />
						Reading
						<DotAnimation />
					</span>
				)}

				<form
					onSubmit={handleFormSubmit}
					className="flex items-start flex-col p-4 pb-2 text-white max-w-xl bg-black mx-auto fixed bottom-0 w-full mb-8 border border-gray-300 rounded-xl shadow-xl"
				>
					<div className="flex items-start w-full">
						<Input
							disabled={status !== "awaiting_message"}
							className="flex-1 placeholder:text-white bg-neutral-900"
							placeholder={prompt}
							onChange={handleMessageChange}
						/>
						<Button
							className="flex-0 ml-2 cursor-pointer"
							variant="ghost"
							type="submit"
							disabled={status !== "awaiting_message"}
						>
							<Icons.arrowRight className="text-gray-200 hover:text-white transition-colors duration-200 ease-in-out" />
						</Button>
					</div>

					<Button
						type="button"
						disabled={status !== "awaiting_message"}
						onClick={handleOpenFileExplorer}
						className="flex gap-x-1 group cursor-pointer text-gray-200 px-1 pb-0"
					>
						<input
							type="file"
							ref={fileInputRef}
							onChange={handleFileChange}
							className="sr-only"
						/>
						<Icons.paperClip className="group-hover:text-white transition-colors duration-200 ease-in-out w-4 h-4" />
						<span className="group-hover:text-white transition-colors duration-200 ease-in-out text-xs">
							{file ? file.name : "Add a file"}
						</span>
					</Button>
				</form>
			</div>
		</main>
	);
};

export default Chat;

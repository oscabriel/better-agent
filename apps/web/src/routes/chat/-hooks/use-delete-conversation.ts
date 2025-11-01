import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/web/lib/orpc";

/**
 * Hook to handle conversation deletion
 */
export function useDeleteConversation() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [isDeleting, setIsDeleting] = useState(false);

	const deleteMutation = useMutation(
		orpc.chat.deleteConversation.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.chat.listConversations.key(),
				});
				toast.success("Conversation deleted");
				void navigate({ to: "/chat" });
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const handleDelete = async (conversationId: string) => {
		if (isDeleting) return;
		setIsDeleting(true);
		try {
			await deleteMutation.mutateAsync({ conversationId });
		} finally {
			setIsDeleting(false);
		}
	};

	return {
		handleDelete,
		isDeleting,
	};
}

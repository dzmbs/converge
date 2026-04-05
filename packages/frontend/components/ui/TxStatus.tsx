"use client";

import { motion, AnimatePresence } from "framer-motion";
import { getExplorerUrl } from "@/lib/contracts";
import type { SupportedChainId } from "@/lib/chains";

interface TxStatusProps {
  chainId: number | undefined;
  txHash: `0x${string}` | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  isError?: boolean;
  /** Override the "confirming" label (defaults to "Transaction submitted") */
  confirmingLabel?: string;
  /** Override the "success" label (defaults to "Transaction confirmed") */
  successLabel?: string;
}

export function TxStatus({
  chainId,
  txHash,
  isPending,
  isConfirming,
  isSuccess,
  isError = false,
  confirmingLabel = "Transaction submitted",
  successLabel = "Transaction confirmed",
}: TxStatusProps) {
  const explorerUrl =
    chainId && txHash
      ? getExplorerUrl(chainId as SupportedChainId, txHash)
      : undefined;

  const visible = isPending || isConfirming || isSuccess || isError;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tx-status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-3 flex items-center justify-center gap-2 text-xs"
        >
          {isPending && (
            <>
              {/* Spinner */}
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-on-surface-variant/30 border-t-secondary animate-spin shrink-0" />
              <span className="text-on-surface-variant">Confirm in wallet...</span>
            </>
          )}

          {!isPending && isConfirming && txHash && (
            <>
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-secondary/30 border-t-secondary animate-spin shrink-0" />
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary hover:underline"
              >
                {confirmingLabel} — view on explorer
                <span className="material-symbols-outlined text-[12px] ml-0.5 align-middle">open_in_new</span>
              </a>
            </>
          )}

          {!isPending && !isConfirming && isSuccess && txHash && (
            <>
              <span className="material-symbols-outlined text-[16px] text-emerald-400 shrink-0">check_circle</span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline font-medium"
              >
                {successLabel} — view on explorer
                <span className="material-symbols-outlined text-[12px] ml-0.5 align-middle">open_in_new</span>
              </a>
            </>
          )}

          {isError && (
            <>
              <span className="material-symbols-outlined text-[16px] text-error shrink-0">cancel</span>
              <span className="text-error">Transaction failed</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

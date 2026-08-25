"""
src/engines/query_router.py

Query Router Module.
Dispatches user queries to the appropriate engine (Single Agent vs Multi-Agent Supervisor).
NOW INCLUDES: PII Guardrails Layer (Defense in Depth).
"""

from __future__ import annotations
from typing import Tuple, List, Optional
from langchain_core.documents import Document

# Internal Modules
from src.core.config_manager import AppConfig
from src.core.guardrails import PIIGuardrail # <--- Import necessario
from src.engines.single_react import SingleAgentEngine
from src.engines.multi_supervisor import SupervisorNetwork

class QueryOrchestrator:
    """
    Main entry point for the chat interface.
    Decides execution strategy based on the 'system_mode' flag.
    """

    @staticmethod
    def dispatch_request(
        user_query: str, 
        settings: AppConfig, 
        metadata_filter: dict = None,
        consistency_check: bool = False,
        use_expansion: bool = False,
        enable_guardrails: bool = False, # Parametro Sicurezza
        trace_reasoning: bool = False
    ) -> Tuple[str, List[Document], Optional[str]]:
        """
        Routes the user query to the active subsystem with all extension parameters.
        """
        
        # --- 🛡️ GUARDRAILS LAYER (Intercept Request) ---
        guardrail_log = ""
        effective_query = user_query

        if enable_guardrails:
            # Eseguiamo la scansione anche qui
            # Se l'UI ha già pulito, is_safe sarà True e non succederà nulla.
            # Se l'UI ha fallito o la chiamata arriva da altrove, questo blocco protegge.
            is_safe, sanitized_text, detected_types = PIIGuardrail.scan_and_redact(user_query)
            
            if not is_safe:
                effective_query = sanitized_text
                # 🟢 FIX SICUREZZA: Rimosso "Original: {user_query}" dal log
                # Ora logghiamo SOLO il fatto che è avvenuta una redazione e la query pulita.
                guardrail_log = f"\n🛡️ **Guardrails Active**: Sensitive data redacted ({', '.join(detected_types)}).\nSanitized Query: {effective_query}\n"
        # -----------------------------------------------

        mode = settings.system_mode
        final_trace = guardrail_log

        # --- ROUTE 1: Multi-Agent Supervisor (Task B) ---
        if mode == "supervisor_agent":
            answer, docs, trace = SupervisorNetwork.execute(
                query=effective_query,  # Usiamo la query (potenzialmente) pulita
                config=settings, 
                return_trace=trace_reasoning,
                use_expansion=use_expansion
            )
            if trace: final_trace += "\n" + trace
            return answer, docs, final_trace

        # --- ROUTE 2: Single ReAct Agent (Task A) ---
        elif mode == "react_agent" or mode == "standard_rag":
            answer, docs, trace = SingleAgentEngine.execute(
                query=effective_query, # Usiamo la query (potenzialmente) pulita
                config=settings, 
                filter_criteria=metadata_filter,
                consistency_check=consistency_check,
                use_expansion=use_expansion,
                return_trace=trace_reasoning
            )
            if trace: final_trace += "\n" + trace
            return answer, docs, final_trace

        else:
            # Fallback
            return SingleAgentEngine.execute(query=effective_query, config=settings)
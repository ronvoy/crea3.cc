"""
src/engines/multi_supervisor.py

Multi-Agent Supervisor Engine (Task B).
Implements a Hierarchical Multi-Agent Architecture where:
1. Supervisor: Routes queries based on agent descriptions.
2. Specialized Agents: Perform local retrieval AND generate partial answers.
3. Aggregator: Synthesizes partial answers into a final comparative response.
"""
from __future__ import annotations
import os
import json
import re  # Import necessario per il boosting regex
from typing import List, Tuple, Optional, Any, Dict, TYPE_CHECKING
from langchain_core.documents import Document

from src.core.llm_factory import LLMFactory
from src.core.data_ingestion import EmbeddingFactory
from src.engines.vector_ops import VectorArchivist

# Gestione Circular Import
if TYPE_CHECKING:
    from src.core.config_manager import AppConfig

class SupervisorNetwork:
    """
    Hierarchical Agent System as per Exam Specifications.
    """

    # DEFINIZIONE DELLE COMPETENZE DEGLI AGENTI (Agent Registry)
    AGENT_REGISTRY = {
        "Italy_Agent": {
            "country": "Italy",
            "db_name": "italy_db",
            "description": "Expert in Italian Law. Handles civil, criminal, and administrative documents specifically within the Italian jurisdiction."
        },
        "Estonia_Agent": {
            "country": "Estonia",
            "db_name": "estonia_db",
            "description": "Expert in Estonian Law. Specialized in digital governance, commercial codes, and Estonian specific legal frameworks."
        },
        "Slovenia_Agent": {
            "country": "Slovenia",
            "db_name": "slovenia_db",
            "description": "Expert in Slovenian Law. Covers constitutional, civil rights, and corporate regulations within the Republic of Slovenia."
        },
        "Belgium_Agent": {
            "country": "Belgium",
            "db_name": "belgium_db",
            "description": "Expert in Belgium Law. Covers constitutional, civil rights, and corporate regulations within the Republic of Belgium."
        },
        "Lithuania_Agent": {
            "country": "Lithuania",
            "db_name": "lithuania_db",
            "description": "Expert in Lithuania Law. Covers constitutional, civil rights, and corporate regulations within the Republic of Lithuania."
        },
        "Croatia_Agent": {
            "country": "Croatia",
            "db_name": "croatia_db",
            "description": "Expert in Croatia Law. Covers constitutional, civil rights, and corporate regulations within the Republic of Croatia."
        }
    }

    @staticmethod
    def execute(
        query: str, 
        config: "AppConfig", 
        return_trace: bool = False,
        use_expansion: bool = False
    ) -> Tuple[str, List[Document], Optional[str]]:
        
        logs = []
        llm = LLMFactory.create_llm(config)
        logs.append(f"**Supervisor**: Received user query: '{query}'")
        requires_retrieval = SupervisorNetwork._classify_intent(query, llm)
        
        if not requires_retrieval:
            logs.append("**Decision**: Query is generic. No retrieval needed.")
            answer = llm.invoke(f"Answer this generic question based on your internal knowledge: {query}").content
            return answer, [], "\n\n".join(logs) if return_trace else None

        logs.append("**Decision**: Query requires specific legal context. Proceeding to Action.")
        
        # 1. Query Expansion (Optional - Technical Step)
        search_query = query
        if use_expansion:
            try:
                llm = LLMFactory.create_llm(config)
                search_query = SupervisorNetwork._expand_query(query, llm)
                logs.append(f"**Supervisor**: Query expanded for better retrieval: '{search_query}'")
            except Exception:
                pass # Fallback to original

        # 2. Supervisor Routing Decision
        selected_agent_keys, reason = SupervisorNetwork._route_query(query, config)
        logs.append(f"**Supervisor Routing**: Activating agents -> {selected_agent_keys}. Reason: {reason}")
        
        all_retrieved_docs: List[Document] = []
        partial_answers: List[str] = []
        
        # 3. Parallel Execution of Specialized Agents
        for agent_key in selected_agent_keys:
            if agent_key not in SupervisorNetwork.AGENT_REGISTRY:
                logs.append(f"**Error**: Unknown agent '{agent_key}' requested. Skipping.")
                continue
                
            agent_info = SupervisorNetwork.AGENT_REGISTRY[agent_key]
            logs.append(f"**Agent Activation**: Starting {agent_key} ({agent_info['country']})...")
            
            # Esecuzione dell'Agente Specializzato
            agent_response, agent_docs, agent_log = SupervisorNetwork._activate_specialized_agent(
                agent_info=agent_info,
                query=query,          # Query originale per la generazione
                search_query=search_query, # Query espansa per il retrieval
                config=config
            )

            # Add safe per-agent retrieval summary to trace
            if agent_log:
                logs.append(f"**{agent_key} Retrieval**: {agent_log}")
            
            # Raccolta risultati
            if agent_docs:
                all_retrieved_docs.extend(agent_docs)
                partial_answers.append(f"--- REPORT FROM {agent_key} ---\n{agent_response}")
                logs.append(f"**{agent_key}**: Finished. Generated partial answer based on {len(agent_docs)} docs.")
            else:
                logs.append(f"**{agent_key}**: No relevant documents found. Skipping report.")

        # 4. Supervisor Aggregation (Final Answer Generation)
        if not partial_answers:
            msg = "I consulted the specialized agents, but none found relevant legal documents to answer your specific query."
            logs.append(f"**Final**: {msg}")
            trace = "\n\n".join(logs) if return_trace else None
            return msg, [], trace

        logs.append("**Supervisor**: Aggregating partial answers into final response...")
        final_answer = SupervisorNetwork._aggregate_partial_answers(query, partial_answers, config)
        
        trace = "\n\n".join(logs) if return_trace else None
        return final_answer, all_retrieved_docs, trace
    
    @staticmethod
    def _classify_intent(query: str, llm: Any) -> bool:
        """Thought Step"""
        prompt = (
            "Determine if the user query requires legal document retrieval.\n"
            "Reply YES if it asks about laws, divorce, inheritance, or cases.\n"
            "Reply NO if it is a greeting or generic chat.\n"
            f"Query: '{query}'\n"
            "Reply (YES/NO):"
        )
        return "YES" in llm.invoke(prompt).content.strip().upper()

    @staticmethod
    def _route_query(query: str, config: "AppConfig") -> Tuple[List[str], str]:
        """Routing Logic"""
        llm = LLMFactory.create_llm(config)
        agents_desc_str = json.dumps(SupervisorNetwork.AGENT_REGISTRY, indent=2)
        
        prompt = (
            "You are the Supervisor of a legal multi-agent system.\n"
            "Your task is to select which specialized agents need to be activated based on the user query.\n\n"
            f"AVAILABLE AGENTS AND EXPERTISE:\n{agents_desc_str}\n\n"
            "INSTRUCTIONS:\n"
            "1. Analyze the query to identify implied jurisdictions (Italy, Estonia, Slovenia).\n"
            "2. If the query asks for a COMPARISON, activate ALL relevant agents.\n"
            "3. If the query is generic (e.g. 'European regulations'), activate ALL agents to check local implementations.\n"
            "4. Return a JSON with the list of keys (e.g. ['Italy_Agent']) and a brief reason.\n\n"
            f"USER QUERY: {query}\n"
            "OUTPUT JSON format: {\"agents\": [\"Italy_Agent\", ...], \"reason\": \"...\"}"
        )
        
        try:
            response = llm.invoke(prompt).content
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            data = json.loads(response)
            agents = data.get("agents", [])
            reason = data.get("reason", "No reason provided")
            if not agents:
                return list(SupervisorNetwork.AGENT_REGISTRY.keys()), "Fallback: Activating all agents due to unclear intent."
            return agents, reason
        except Exception as e:
            return list(SupervisorNetwork.AGENT_REGISTRY.keys()), f"Error in routing ({e}). Activating all."

    @staticmethod
    def _discover_agent_stores(vector_root: str, default_db_name: str) -> List[str]:
        """Discover available per-country vector stores.

        Supports the current layout (e.g. italy_db) and future topic shards
        (e.g. italy_divorce_db, italy_succession_db). Only folders on disk are returned.
        """
        if not vector_root or not os.path.exists(vector_root):
            return []

        default_slug = default_db_name.replace("_db", "").lower()
        found: List[str] = []

        for name in os.listdir(vector_root):
            path = os.path.join(vector_root, name)
            if not os.path.isdir(path):
                continue
            if name == "merged_legal_index":
                continue

            low = name.lower()
            if name == default_db_name:
                found.append(name)
                continue

            # Match topic shards for the same country (prefix match)
            if low.startswith(default_slug) and low.endswith("_db"):
                found.append(name)

        # Stable ordering: default first, then alpha
        if default_db_name in found:
            return [default_db_name] + sorted([x for x in found if x != default_db_name])
        # If default exists but wasn't listed for any reason, still include it
        if os.path.isdir(os.path.join(vector_root, default_db_name)):
            return [default_db_name] + sorted(found)
        return sorted(found)

    @staticmethod
    def _react_plan_retrieval(
        *,
        llm: Any,
        country: str,
        user_query: str,
        expanded_query: str,
        available_store_names: List[str],
    ) -> Tuple[List[str], List[str], str, str]:
        """ReAct-style planning step over *multiple vector stores*.

        Goal: choose (1) which *law* stores to search first and (2) whether to also
        search *case* stores, so the agent can answer with a strict hierarchy:
        **laws first, then cases as support**.

        We do NOT return chain-of-thought. We only return:
        - chosen_law_stores
        - chosen_case_stores (may be empty)
        - retrieval query
        - a short note suitable for traces
        """

        def _hint(store_name: str) -> str:
            s = store_name.lower()
            if "cases" in s:
                return "case-law"
            if any(k in s for k in ["divorce", "family", "separation", "marriage"]):
                return "divorce/family"
            if any(k in s for k in ["succession", "inherit", "inheritance", "estate", "probate", "will"]):
                return "succession/inheritance"
            return "general"

        stores_with_hints = [
            {"name": n, "hint": _hint(n)} for n in available_store_names
        ]

        max_law_stores = int(os.getenv("REACT_STORE_MAX_LAW_STORES", "2"))
        max_case_stores = int(os.getenv("REACT_STORE_MAX_CASE_STORES", "1"))

        # Partition stores into LAW vs CASE stores by name convention
        law_store_names = [s for s in available_store_names if "cases" not in s.lower()]
        case_store_names = [s for s in available_store_names if "cases" in s.lower()]

        prompt = (
            f"You are a retrieval planner for {country} legal documents.\n"
            "Your task: choose which vector store(s) to search, and produce a good retrieval query.\n"
            "IMPORTANT: Follow a strict hierarchy: search LEGAL RULES/STATUTES first; use CASE-LAW only if needed.\n\n"
            "AVAILABLE VECTOR STORES (choose from this list only):\n"
            + "\n".join([f"- {x['name']} (topic: {x['hint']})" for x in stores_with_hints])
            + "\n\n"
            "RULES:\n"
            f"- Select 1 to {max_law_stores} LAW stores from the list (prefer *_divorce_db / *_inheritance_db / *_db).\n"
            f"- Optionally select 0 to {max_case_stores} CASE stores (names containing 'cases') ONLY if the user asks for cases/examples OR the law sources may be insufficient.\n"
            "- Produce a concise retrieval query (may reuse the expanded query).\n"
            "- Output ONLY minified JSON in this schema:"
            " {\"law_stores\":[\"...\"],\"case_stores\":[\"...\"],\"search_query\":\"...\",\"note\":\"...\"}.\n"
            "- The note must be <= 140 chars and MUST NOT reveal chain-of-thought.\n\n"
            f"USER QUERY: {user_query}\n"
            f"EXPANDED QUERY: {expanded_query}\n"
        )

        try:
            raw = llm.invoke(prompt).content
            if "```" in raw:
                # strip any code fences
                raw = re.split(r"```(?:json)?", raw)[-1]
                raw = raw.split("```")[0]
            data = json.loads(raw)
            law = [s for s in data.get("law_stores", []) if s in law_store_names][:max_law_stores]
            case = [s for s in data.get("case_stores", []) if s in case_store_names][:max_case_stores]
            search_q = (data.get("search_query") or "").strip() or expanded_query
            note = (data.get("note") or "").strip()[:140]
            # Safety: ensure at least one law store
            if not law:
                law = law_store_names[:1] if law_store_names else available_store_names[:1]
            return law, case, search_q, note
        except Exception:
            # Heuristic fallback (deterministic)
            ql = (user_query or "").lower()
            law_candidates: List[str] = []
            if any(k in ql for k in ["divorce", "separation", "marriage", "alimony", "custody", "affidamento", "divorzio"]):
                law_candidates = [s for s in law_store_names if "divorce" in s.lower()]
            elif any(k in ql for k in ["inherit", "inheritance", "succession", "estate", "will", "testament", "successione", "eredità", "eredit\u00e0"]):
                law_candidates = [s for s in law_store_names if "inherit" in s.lower()]
            if not law_candidates:
                law_candidates = law_store_names[:1] if law_store_names else available_store_names[:1]

            wants_cases = any(k in ql for k in ["case", "cases", "judgment", "precedent", "sentenza", "giurisprud", "tribunal", "court"])
            case_candidates: List[str] = []
            if wants_cases and case_store_names:
                # Pick topic-aligned cases store if available
                if any(k in ql for k in ["divorce", "divorzio", "separation", "marriage"]):
                    case_candidates = [s for s in case_store_names if "divorce" in s.lower()]
                elif any(k in ql for k in ["inherit", "inheritance", "succession", "successione", "eredit"]):
                    case_candidates = [s for s in case_store_names if "inherit" in s.lower()]
                if not case_candidates:
                    case_candidates = case_store_names[:1]

            return law_candidates[:max_law_stores], case_candidates[:max_case_stores], expanded_query, "fallback planner"

    @staticmethod
    def _activate_specialized_agent(
        agent_info: Dict, 
        query: str, 
        search_query: str,
        config: "AppConfig"
    ) -> Tuple[str, List[Document], str]:
        """
        Specialized agent logic.

        ✅ Update (Multi-Vector + ReAct-style retrieval planning)
        Each national sub-agent now *plans* which vector store(s) to query based on the user question.
        This enables different per-country stores (e.g. divorce/succession shards) without changing the
        rest of the supervisor pipeline.

        Notes:
        - We do NOT return raw chain-of-thought. We only log the chosen stores and the planner rationale.
        - If topic-specific stores are not present on disk, we fall back to the default country store.
        """
        embedding_model = EmbeddingFactory.create_embedding_model(config)
        # Total retrieval budget (will be split equally across the selected stores)
        total_k = int(config.retrieval_top_k)

        # --- Discover available vector stores for this country (supports future topic shards) ---
        stores = SupervisorNetwork._discover_agent_stores(
            vector_root=config.vector_db_root_path,
            default_db_name=agent_info["db_name"],
        )

        if not stores:
            return "Database not available.", [], "DB missing"

        # --- ReAct-style planning: decide which store(s) to query + retrieval rewrite ---
        llm = LLMFactory.create_llm(config)
        chosen_law_stores, chosen_case_stores, planned_search_query, planner_note = SupervisorNetwork._react_plan_retrieval(
            llm=llm,
            country=agent_info["country"],
            user_query=query,
            expanded_query=search_query,
            available_store_names=stores,
        )

        # Fallback safety: ensure at least one law store
        if not chosen_law_stores:
            chosen_law_stores = [agent_info["db_name"]]
        if not planned_search_query:
            planned_search_query = search_query

        try:
            final_docs: List[Document] = []
            selected_paths: List[str] = []

            # --- Retrieve in strict hierarchy: LAW stores first, then CASE stores (optional) ---
            ordered_stores: List[str] = list(chosen_law_stores) + [s for s in chosen_case_stores if s not in chosen_law_stores]

            # IMPORTANT ROUTING RULE:
            # If the agent decides to query multiple vector DBs, we MUST retrieve the SAME number of
            # chunks from EACH selected DB (not just split a global budget). This makes the planner
            # decision meaningful and avoids starving secondary stores.
            #
            # Default: use config.retrieval_top_k per store.
            # You can override with RETRIEVAL_K_PER_STORE.
            per_store_k = int(os.getenv("RETRIEVAL_K_PER_STORE", str(total_k)))
            per_store_k = max(1, per_store_k)

            for idx, store_name in enumerate(ordered_stores):
                store_path = os.path.join(config.vector_db_root_path, store_name)
                if not os.path.exists(store_path):
                    continue
                selected_paths.append(store_path)

                vectorstore = VectorArchivist.load_index(store_path, embedding_model)
                if not vectorstore:
                    continue
            
                # Per-store target budget (same for every selected store)
                store_target_k = per_store_k
                store_docs: List[Document] = []

                # --- STEP 1: DIRECT METADATA LOOKUP (Article boosting) ---
                match = re.search(r'(?:art\.?|article)\s*(\d+)', query.lower())
                if match:
                    article_num = match.group(1)
                    target_code = f"Art. {article_num}"

                    def article_filter(metadata: Dict) -> bool:
                        code = metadata.get("civil_codes_used") or metadata.get("art")
                        if code and isinstance(code, str):
                            return target_code.lower() in code.lower()
                        return False

                    # Limit article boost within the per-store budget
                    specific_retriever = vectorstore.as_retriever(search_kwargs={"k": min(5, store_target_k), "filter": article_filter})
                    article_docs = specific_retriever.invoke(query)
                    for d in article_docs or []:
                        d.page_content = f"*** PRIMARY SOURCE ({target_code}) ***\n{d.page_content}"
                        d.metadata["vector_store"] = store_name
                        d.metadata["source_agent"] = agent_info["country"]
                        store_docs.append(d)
                        if len(store_docs) >= store_target_k:
                            break

                # --- STEP 2: SEMANTIC SEARCH (planned query) ---
                remaining_k = max(0, store_target_k - len(store_docs))
                if remaining_k > 0:
                    general_retriever = vectorstore.as_retriever(search_kwargs={"k": remaining_k})
                    context_docs = general_retriever.invoke(planned_search_query)
                    existing_contents = set(d.page_content.split("\n", 1)[-1] for d in store_docs)
                    for d in context_docs or []:
                        if d.page_content in existing_contents:
                            continue
                        d.metadata["vector_store"] = store_name
                        d.metadata["source_agent"] = agent_info["country"]
                        store_docs.append(d)
                        if len(store_docs) >= store_target_k:
                            break

                # Merge this store's docs into final list (preserving per-store equality)
                final_docs.extend(store_docs)

            if not final_docs:
                return "No relevant documents found.", [], "No docs"

            # --- STEP 3: GENERATION ---
            # Keep law sources before cases in the provided context
            law_docs = [d for d in final_docs if "cases" not in str(d.metadata.get("vector_store", "")).lower()]
            case_docs = [d for d in final_docs if "cases" in str(d.metadata.get("vector_store", "")).lower()]
            ordered_docs = law_docs + case_docs

            context_text = "\n\n".join([d.page_content for d in ordered_docs])
            llm = LLMFactory.create_llm(config)
            
            prompt = (
                f"You are the {agent_info['country']} Legal Specialist.\n"
                "Answer the user query based ONLY on the provided context excerpts.\n"
                "STRICT HIERARCHY: First explain the applicable LEGAL RULES/STATUTES/PROCEDURE. Only AFTER that, you may mention past cases as supporting examples.\n"
                "If the context is insufficient, say so and ask 1-2 precise clarification questions.\n"
                "If the context contains a section marked 'PRIMARY SOURCE', quote it directly.\n"
                "Do not mention other countries.\n"
                "When possible, cite sources as [Doc 1], [Doc 2] corresponding to the provided excerpts.\n\n"
                f"CONTEXT ({agent_info['country']}):\n{context_text}\n\n"
                f"QUERY: {query}\n\n"
                "YOUR PROFESSIONAL ANSWER (laws first, cases second):"
            )
            
            partial_answer = llm.invoke(prompt).content
            
            # Tagging finale
            for d in final_docs:
                d.metadata['source_agent'] = agent_info['country']
                
            plan_summary = (
                f"law_stores={chosen_law_stores}; case_stores={chosen_case_stores}; "
                f"search_query='{planned_search_query}'; note='{planner_note}'"
            )
            return partial_answer, final_docs, plan_summary

        except Exception as e:
            return f"Error processing request: {e}", [], str(e)

    @staticmethod
    def _aggregate_partial_answers(query: str, partial_reports: List[str], config: "AppConfig") -> str:
        """
        Aggregator Logic: Synthesizes the different perspectives from the agents.
        """
        llm = LLMFactory.create_llm(config)
        combined_reports = "\n\n".join(partial_reports)
        
        prompt = (
            "You are a Senior Legal Supervisor and Comparative Law Expert.\n"
            "You have received partial reports from specialized agents (Italy, Estonia, Slovenia).\n"
            "Your task is to synthesize these reports into a SINGLE coherent answer for the user.\n\n"
            "INSTRUCTIONS:\n"
            "1. Answer the user's question directly.\n"
            "2. Compare the normative solutions if multiple countries provided relevant info.\n"
            "3. Highlight divergences and similarities explicitly.\n"
            "4. Hide the internal complexity (do not say 'Agent X said...', instead say 'In Italy...').\n"
            "5. If one agent found nothing relevant, you may omit it or briefly mention the lack of specific regulation if relevant.\n\n"
            f"USER QUERY: {query}\n\n"
            f"AGENT REPORTS:\n{combined_reports}\n\n"
            "FINAL COHERENT RESPONSE:"
        )
        return llm.invoke(prompt).content

    @staticmethod
    def _expand_query(original_query: str, llm_engine: Any) -> str:
        """Helper for keyword expansion."""
        prompt = (
            "Reformulate this legal query for better vector retrieval. "
            "Keep it concise. Output only the rewritten query.\n"
            f"Query: {original_query}"
        )
        return llm_engine.invoke(prompt).content.strip()
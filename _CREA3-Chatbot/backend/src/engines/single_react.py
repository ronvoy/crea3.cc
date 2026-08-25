#QUI USA FETCH-K 500 (ESTREMO, PROVARE CON VALORI PIU' BASSI)
"""
src/engines/single_react.py

Single Agent Engine (Task A) - ReAct Implementation.
Corrected for Text Mining Exam.
FINAL FIX V4 (NUCLEAR OPTION): 
1. QUERY SANITIZATION: Removes conflicting country names from the query string (e.g. removes 'Slovenia' when searching 'Estonia').
2. MANUAL FETCH & FILTER: Bypasses 'as_retriever' blackbox. Fetches 500 raw docs and filters in Python.
3. LOGIC: Implements "Country First" simulation via vector stripping.
"""
from __future__ import annotations
import os
import json
import re
from collections import Counter
from typing import List, Tuple, Optional, Any, Dict
from langchain_core.documents import Document

from src.core.config_manager import AppConfig
from src.core.llm_factory import LLMFactory
from src.core.data_ingestion import EmbeddingFactory
from src.engines.vector_ops import VectorArchivist

class SingleAgentEngine:
    
    SUPPORTED_COUNTRIES = ["Italy", "Estonia", "Slovenia"]

    @staticmethod
    def execute(
        query: str, 
        config: AppConfig, 
        return_trace: bool = False,
        use_expansion: bool = False,
        consistency_check: bool = False,
        **kwargs
    ) -> Tuple[str, List[Document], Optional[str]]:
        
        logs = []
        llm = LLMFactory.create_llm(config)
        
        # --- FASE 1: THOUGHT ---
        logs.append(f"**Thought**: Analyzing query: '{query}'")
        requires_retrieval = SingleAgentEngine._classify_intent(query, llm)
        
        if not requires_retrieval:
            logs.append("**Decision**: Query is generic. No retrieval needed.")
            answer = llm.invoke(f"Answer this generic question based on your internal knowledge: {query}").content
            return answer, [], "\n\n".join(logs) if return_trace else None

        logs.append("**Decision**: Retrieval Required.")

        # --- FASE 2: ACTION ---
        
        # 2a. Query Expansion
        search_query = query
        if use_expansion:
            expanded = SingleAgentEngine._expand_query(query, llm)
            search_query = expanded
            logs.append(f"**Action**: Query expanded to: '{expanded}'")

        # 2b. Criteria Extraction
        raw_criteria, reason = SingleAgentEngine._extract_search_criteria(query, llm)
        
        # 2c. Wildcard Expansion
        final_criteria_list = SingleAgentEngine._expand_wildcard_criteria(raw_criteria)
        logs.append(f"**Action**: Search Criteria -> {json.dumps(final_criteria_list, indent=2)} ({reason})")
        
        # 2d. Load Index
        path = os.path.join(config.vector_db_root_path, "merged_legal_index")
        if not os.path.exists(path):
             return "System Error: Index not found.", [], None

        embedding_model = EmbeddingFactory.create_embedding_model(config)
        vectorstore = VectorArchivist.load_index(path, embedding_model)
        
        # --- RETRIEVAL LOOP ---
        all_retrieved_docs = []
        doc_ids = set()
        k_per_country = int(config.retrieval_top_k) 
        
        for criteria in final_criteria_list:
            target_country = criteria.get("country") 
            target_law = criteria.get("law")
            
            # 1. QUERY SANITIZATION
            clean_query = SingleAgentEngine._sanitize_query_for_country(
                search_query, target_country, SingleAgentEngine.SUPPORTED_COUNTRIES
            )
            
            # 2. LOCALIZED QUERY BOOST (Per ricerca semantica generale)
            localized_query = f"Context: {target_country} {target_law}. Query: {clean_query}"

            current_country_docs = []

            # =========================================================================
            # [STEP 2.5] DIRECT METADATA LOOKUP (Article Boosting - MANUAL MODE)
            # =========================================================================
            article_match = re.search(r'(?:art\.?|article)\s*(\d+)', search_query.lower())
            if article_match:
                art_num = article_match.group(1)
                target_code = f"Art. {art_num}" # Es. "Art. 160"
                
                # Query specifica per massimizzare la similarità vettoriale con l'header
                # Usiamo "Art. 160 Italy" invece della query lunga dell'utente
                specific_q = f"{target_code} {target_country}"
                
                try:
                    # Fetch manuale di 50 candidati focalizzati sull'articolo
                    art_candidates = vectorstore.similarity_search(specific_q, k=50)
                    
                    found_count = 0
                    for doc in art_candidates:
                        # Filtro Manuale Python su 'civil_codes_used'
                        code_meta = doc.metadata.get("civil_codes_used", "")
                        
                        # Check 1: Il metadato contiene "Art. 160"?
                        if target_code.lower() in str(code_meta).lower():
                            
                            # Check 2: Il paese è giusto?
                            c_meta = str(doc.metadata.get("country") or doc.metadata.get("source_country") or "").lower()
                            if target_country.lower() != "all" and target_country.lower() not in c_meta:
                                continue

                            # Trovato! Aggiungi con priorità
                            doc.page_content = f"*** PRIMARY SOURCE ({target_code}) ***\n{doc.page_content}"
                            d_hash = hash(doc.page_content)
                            
                            if d_hash not in doc_ids:
                                doc_ids.add(d_hash)
                                current_country_docs.append(doc)
                                all_retrieved_docs.append(doc)
                                found_count += 1
                                
                                # Se abbiamo riempito il K solo con gli articoli, ci fermiamo
                                if len(current_country_docs) >= k_per_country:
                                    break
                    
                    if found_count > 0:
                        logs.append(f"**Action ({target_country})**: Boosted {found_count} article docs via metadata (Query: '{specific_q}').")

                except Exception as e:
                    logs.append(f"**Warning**: Article lookup failed: {e}")
            # =========================================================================


            # 3. MANUAL FETCH (NUCLEAR FETCH_K - Semantic Search)
            # Eseguiamo questo step solo se abbiamo ancora "spazio" nel k_per_country
            if len(current_country_docs) < k_per_country:
                fetch_k = 500 
                try:
                    raw_candidates = vectorstore.similarity_search(localized_query, k=fetch_k)
                    
                    # 4. PYTHON FILTERING
                    for doc in raw_candidates:
                        if len(current_country_docs) >= k_per_country:
                            break
                            
                        # Logica Filtro
                        meta = doc.metadata
                        c_val = meta.get("country") or meta.get("source_country") or meta.get("type") or "General"
                        l_val = meta.get("law") or meta.get("category") or "General"
                        
                        doc_c = str(c_val).lower().strip()
                        doc_l = str(l_val).lower().strip()
                        tgt_c = target_country.lower().strip()
                        tgt_l = target_law.lower().strip()
                        
                        match_country = (tgt_c == "all") or (tgt_c == doc_c) or (tgt_c in doc_c)
                        match_law = (tgt_l == "all") or (tgt_l == doc_l) or (tgt_l in doc_l)
                        
                        if match_country and match_law:
                            d_hash = hash(doc.page_content)
                            if d_hash not in doc_ids:
                                doc_ids.add(d_hash)
                                current_country_docs.append(doc)
                                all_retrieved_docs.append(doc)

                    logs.append(f"**Action ({target_country})**: Total docs collected: {len(current_country_docs)}.")
                            
                except Exception as e:
                    logs.append(f"**Error**: Retrieval failed for {target_country}: {e}")

        # Global Check
        if not all_retrieved_docs:
            return "No relevant documents found.", [], "\n".join(logs)

        # --- FASE 3: OBSERVATION ---
        obs = SingleAgentEngine._generate_observation(all_retrieved_docs)
        logs.append(f"**Observation**: {obs}")

        # --- FASE 4: ANSWER ---
        context_text = ""
        for i, d in enumerate(all_retrieved_docs):
            c_disp = d.metadata.get("country") or d.metadata.get("type") or "Unknown"
            context_text += f"[Doc {i+1}] ({c_disp}): {d.page_content}\n\n"
        
        final_prompt = (
            "You are a legal assistant for European Civil Law.\n"
            "Answer using ONLY the provided context.\n"
            "Compare the countries ONLY if multiple are present in the context.\n"
            "Cite using [Doc X].\n\n"
            f"QUERY: {query}\n"
            f"OBSERVATION: {obs}\n"
            f"CONTEXT:\n{context_text}\n"
            "ANSWER:"
        )
        
        answer = llm.invoke(final_prompt).content
        
        if consistency_check:
            is_valid, warning = SingleAgentEngine._perform_consistency_check(answer, all_retrieved_docs)
            if not is_valid: answer += f"\n\n⚠️ {warning}"

        return answer, all_retrieved_docs, "\n\n".join(logs) if return_trace else None

    @staticmethod
    def _sanitize_query_for_country(query: str, target: str, all_countries: List[str]) -> str:
        """
        Rimuove dalla query i nomi e gli aggettivi degli ALTRI paesi.
        Es. Se target="Estonia", rimuove "Slovenia", "Slovenian", "Italy", "Italian".
        Questo purifica il vettore di ricerca.
        """
        if target.lower() == "all": return query
        
        clean_q = query
        for country in all_countries:
            if country.lower() != target.lower():
                # Rimuovi Nome (es. "Slovenia")
                clean_q = re.sub(f"(?i)\\b{country}\\b", "", clean_q)
                # Rimuovi Aggettivo (es. "Slovenian" - regola euristica semplice)
                # Toglie "n" o "an" finale
                adj_root = country[:-1] if country.endswith("a") else country
                clean_q = re.sub(f"(?i)\\b{adj_root}[a-z]*\\b", "", clean_q)
        
        # Rimuovi spazi doppi creati dalla rimozione
        return re.sub(r'\s+', ' ', clean_q).strip()

    @staticmethod
    def _expand_wildcard_criteria(criteria_list: List[Dict]) -> List[Dict]:
        has_all = False
        for c in criteria_list:
            if c.get("country", "All").lower() == "all":
                has_all = True
                break
        
        if has_all:
            base_law = criteria_list[0].get("law", "All")
            return [{"country": c, "law": base_law} for c in SingleAgentEngine.SUPPORTED_COUNTRIES]
        
        return criteria_list

    @staticmethod
    def _classify_intent(query: str, llm: Any) -> bool:
        return "YES" in llm.invoke(f"Is this legal query? (YES/NO): {query}").content.upper()

    @staticmethod
    def _extract_search_criteria(query: str, llm: Any) -> Tuple[List[Dict], str]:
        prompt = (
            "Extract search metadata. Return JSON list.\n"
            "Valid Countries: Italy, Estonia, Slovenia (or 'All').\n"
            "Valid Laws: Inheritance, Divorce (or 'All').\n\n"
            "EXAMPLES:\n"
            "1. 'Compare Italy and Estonia' -> [{\"country\": \"Italy\", \"law\": \"All\"}, {\"country\": \"Estonia\", \"law\": \"All\"}]\n"
            "2. 'Tell me about Estonian inheritance' -> [{\"country\": \"Estonia\", \"law\": \"Inheritance\"}]\n"
            "3. 'Slovenian divorce law' -> [{\"country\": \"Slovenia\", \"law\": \"Divorce\"}]\n"
            "4. 'Compare divorce laws' -> [{\"country\": \"All\", \"law\": \"Divorce\"}]\n\n"
            f"Query: {query}\nJSON:"
        )
        try:
            txt = llm.invoke(prompt).content.strip()
            if "```" in txt:
                txt = txt.split("```json")[-1].split("```")[0] if "json" in txt else txt.split("```")[1]
            
            data = json.loads(txt.strip())
            
            if isinstance(data, dict): 
                criteria_list = data.get("criteria", [data])
            else:
                criteria_list = data
            
            normalized_list = []
            
            for item in criteria_list:
                c_raw = str(item.get("country", "All")).strip()
                l_raw = str(item.get("law", "All")).strip()
                
                c_upper = c_raw.upper()
                c_final = "All"
                
                if "ITAL" in c_upper: c_final = "Italy"
                elif "ESTO" in c_upper: c_final = "Estonia"
                elif "SLOV" in c_upper: c_final = "Slovenia"
                elif c_upper == "ALL": c_final = "All"
                
                if c_final == "All" and c_raw.title() in SingleAgentEngine.SUPPORTED_COUNTRIES:
                    c_final = c_raw.title()

                normalized_list.append({"country": c_final, "law": l_raw})
                
            return normalized_list, "Parsed"

        except Exception as e:
            return [{"country": "All", "law": "All"}], f"Error: {e}"

    @staticmethod
    def _expand_query(q: str, llm: Any) -> str:
        return llm.invoke(f"Refine for vector search: {q}").content.strip()

    @staticmethod
    def _generate_observation(docs: List[Document]) -> str:
        countries = []
        for d in docs:
            c = d.metadata.get("country") or d.metadata.get("type") or "Unknown"
            countries.append(c)
        return f"Retrieved {len(docs)} docs. Distribution: {dict(Counter(countries))}"

    @staticmethod
    def _perform_consistency_check(answer: str, docs: List[Document]) -> Tuple[bool, str]:
        if docs and "[Doc" not in answer: return False, "Citations missing."
        return True, ""
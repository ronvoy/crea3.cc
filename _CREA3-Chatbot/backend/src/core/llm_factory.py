# """
# src/core/llm_factory.py

# LLM Factory Module.
# Abstracts the instantiation of Language Models (Groq, OpenAI, HuggingFace).
# Now supports dynamic configuration for Temperature and Max Tokens (Extension 1).
# """

import os
from typing import Optional
from langchain_core.language_models.chat_models import BaseChatModel

# Provider Libraries
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from src.core.config_manager import AppConfig

class LLMFactory:
    """
    Factory class to create LLM instances based on configuration.
    """

    @staticmethod
    def create_llm(config: AppConfig) -> Optional[BaseChatModel]:
        """
        Main entry point. Dispatches the request to the specific provider initializer.
        """
        #IL PROVIDER ED IL MODELLO SONO STATI IMPOSTATI IN start.py, IN config_manager.py ABBIAMO I VALORI DI DEFAULT
        provider = config.llm_tech_stack.lower()
        model_name = config.llm_model_name

        if provider == "mistral":
            return LLMFactory._init_mistral_service(model_name, config)

        elif provider == "openai":
            return LLMFactory._init_gpt_service(model_name, config)

        elif provider == "groq":
            return LLMFactory._init_groq_service(model_name, config)

        elif provider == "huggingface":
            # Passiamo 'config' anche qui!
            return LLMFactory._instantiate_local_model("mistralai/Mistral-7B-Instruct-v0.3", config)

        else:
            print(f"[LLM Factory] Unsupported provider: {provider}")
            return None

    # --- SPECIFIC INITIALIZERS ---

    @staticmethod
    def _init_mistral_service(model_name: str, config: AppConfig) -> BaseChatModel:
        """Mistral La Plateforme via its OpenAI-compatible API.

        Reuses langchain-openai's ChatOpenAI pointed at Mistral's endpoint, so no
        extra dependency is needed. Model + key come from the environment
        (LLM_MODEL, e.g. 'ministral-8b-latest'; MISTRAL_API_KEY).
        """
        base_url = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1")
        return ChatOpenAI(
            model=model_name,
            api_key=os.getenv("MISTRAL_API_KEY"),
            base_url=base_url,
            temperature=config.llm_temperature,
            max_tokens=config.llm_max_tokens,
        )

    @staticmethod
    def _init_gpt_service(model_name: str, config: AppConfig) -> BaseChatModel:
        return ChatOpenAI(
            model=model_name,
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=config.llm_temperature, # EXTENSION
            max_tokens=config.llm_max_tokens      # EXTENSION
        )

    @staticmethod
    def _init_groq_service(model_name: str, config: AppConfig) -> BaseChatModel:
        return ChatGroq(
            model_name=model_name,
            api_key=os.getenv("GROQ_API_KEY"),
            temperature=config.llm_temperature, # EXTENSION
            max_tokens=config.llm_max_tokens      # EXTENSION
        )

    @staticmethod
    def _instantiate_local_model(repo_id: str, config: AppConfig) -> Optional[BaseChatModel]:
        """
        Connects to Hugging Face Hub with dynamic params.
        """
        if not repo_id:
            return None

        print(f"[LLM Factory] Loading HuggingFace Endpoint: {repo_id}")
        
        try:
            # Lazy import — see data_ingestion.py: the HuggingFace stack is an
            # optional extra, not part of the default image.
            try:
                from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
            except ImportError as exc:                  # pragma: no cover
                raise RuntimeError(
                    "This backend needs the optional local-AI stack. Rebuild with "
                    "--build-arg WITH_LOCAL_AI=1 (or pip install -r requirements-local-ai.txt)."
                ) from exc

            llm_endpoint = HuggingFaceEndpoint(
                repo_id=repo_id,
                task="text-generation",
                # EXTENSION: Parametri dinamici
                max_new_tokens=config.llm_max_tokens,
                temperature=config.llm_temperature,
                timeout=120,
            )
            return ChatHuggingFace(llm=llm_endpoint)
        
        except Exception as e:
            print(f"[LLM Factory] Error initializing HF model: {e}")
            return None




# import os
# from typing import Optional
# from langchain_core.language_models.chat_models import BaseChatModel
# from langchain_openai import ChatOpenAI
# from dotenv import load_dotenv
# load_dotenv()

# from src.core.config_manager import AppConfig


# class LLMFactory:
#     """
#     Factory class to create OpenAI LLM instances based on configuration.
#     """

#     @staticmethod
#     def create_llm(config: AppConfig) -> Optional[BaseChatModel]:
#         """
#         Creates an OpenAI Chat model instance using configuration.
#         """
#         model_name = config.llm_model_name
#         return LLMFactory._init_openai_service(model_name, config)

#     @staticmethod
#     def _init_openai_service(model_name: str, config: AppConfig) -> BaseChatModel:
#         """
#         Initialize OpenAI Chat model.
#         """
#         return ChatOpenAI(
#             model=model_name,
#             api_key=os.getenv("OPENAI_API_KEY"),
#             temperature=config.llm_temperature,
#             max_tokens=config.llm_max_tokens
#         )


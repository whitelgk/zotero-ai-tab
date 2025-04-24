# zotero-ai-tab
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

# local
 - '保存=save',  '添加=add',  '删除=delete',  '按钮=button',  '设置=setting',  '保存当前配置=Save the current configuration',  '删除选中配置=Delete the selected configuration',  '自定义按钮设置=Custom Button Settings',  '添加新按钮=Add a new button',  '保存按钮设置=Save the button setting',  '新增对话=Create a new conversation',  '历史记录=Conversation History'.

 - ![image](https://github.com/user-attachments/assets/7d2608ec-1e56-48c8-b129-8449d09e7454)


# Usage Tutorial：
Default Settings Interface：

![image](https://github.com/user-attachments/assets/a0caf0f4-25cc-463d-940c-4ce41a55ad2e)


 - It's a very simple settings interface. Basically, anyone can handle it.

 - api密钥=api-key

 - api端点=api-url
   - The URL needs to include '/chat/completions' completely. It cannot be in the form of 'https://api.openai.com/v1'. 
   - For example, the official website of DeepSeek requires you to fill in 'https://api.deepseek.com/v1/chat/completions or https://api.deepseek.com/chat/completions'. 
   - For example, for OpenAI, you need to fill in 'https://api.openai.com/v1/chat/completions'. 
   - As for what to fill in specifically, please refer to the invocation documentation provided by the large model provider you are using. 

 - The settings for the model names(模型名称) vary slightly among different providers. 
   - For example, for the Deepseek-R1 model of Deepseek's official version, you need to fill in 'deepseek-reasoner', and for the Deepseek-V3 model, you need to fill in 'deepseek-chat'. 
   - For the Deepseek-R1 model of Alibaba Cloud, you need to fill in "deepseek-r1", and for the Deepseek-V3 model, you need to fill in "deepseek-v3". 
   - As for what to fill in specifically, please refer to the invocation documentation of the provider of the large model you are using. 

 - The temperature(温度系数) is set to 0.7 by default. 
   - A little tip: If you are using the API of Deepseek's official deepseek-v3, it is recommended to set the temperature to 1.  
   - The training temperature of deepseek-v3 is 0.3. However, most people use the default value of 1 when configuring it. Therefore, the official Deepseek has added a scaling mechanism, and users can simply set it to 1. The latest version v3 (deepseek-v3-250324) of the Doubao Huoshan large model platform also supports this scaling mechanism. Users can set it to 1 when using it. For other platforms, if the v3 version is not the latest 0324 version or does not support this scaling mechanism, it is recommended to set the temperature to 0.3.  

 - System prompt(系统提示), generally, you don't need to worry about it by default. If you have a better prompt, you can set it by yourself.

 - Custom Button Settings: In essence, it is a send button with a built-in prompt, and the sentence following it is the prompt. 
   - A little tip: While reading, you can select a paragraph of text and directly drag it into the input box in the sidebar. After dragging it into the input box, you will notice that the text has a Zotero format suffix. You don't need to worry about this. The plugin already has built-in regular expression code for clearing, and you can just click the normal buttons (such as the summarize(总结文本), translate(翻译文本), explain buttons(解释文本), etc.).  


# The next phase (Version 1.0.2)
 - Add AI streaming output. At the current stage, it just shows "ai is thinking", and the output process of the AI cannot be seen. (Difficulty: Relatively difficult) 

# Thanks
- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
- [Zotero GPT](https://github.com/MuiseDestiny/zotero-gpt)
- [Zotero Pdf Translate](https://github.com/windingwind/zotero-pdf-translate)
- [zotero-paper-agent](https://github.com/windfollowingheart/zotero-paper-agent)

# Development Process
 - Previously, I had never been involved in the development of Zotero plugins, and my coding skills were basically at the level of someone who had taken a college computer programming course. Therefore, all the code for this project was written by AI, and I only took charge of constructing the overall ideas.  
 - Last year, when I was writing my graduation thesis, I came across Zotero. However, the AI plugins like those related to GPT always felt a bit lacking in terms of the user experience. They could only be described as just barely satisfactory. Most of the plugins I found in the plugin store by searching keywords such as "GPT" and "AI" adopted the design of a dialogue pop-up window, which is not very friendly to most students who only have a small laptop screen. Inspired by the translation plugin '[Zotero Pdf Translate](https://github.com/windingwind/zotero-pdf-translate)', I hoped to develop a sidebar AI chat plugin: conducting AI conversations in the sidebar without affecting reading, and the plugin itself would come with multiple AI functions. Thus, this plugin was born.  
 - Regrettably, my coding ability is limited. Although I have a complete set of ideas for the plugin, the code is ultimately restricted by the capabilities of the AI. I spent four or five days developing with the help of AI and completed this version of the plugin. It allows for custom model settings, has a record of historical conversations, and features functions such as a lazy version of summarization, translation, and explanation. However, I still feel that it's not enough. I also want to add more functions: the ability to switch models in the sidebar, the option to upload files to the AI, the function to save the text output by the AI to Zotero's notes, the feature that when text is selected during reading, it will be translated directly in the sidebar, and when some items are selected, the AI can generate abstracts or overviews, among others. In short, I want to be a "stitcher" and integrate all the useful functions of other plugins into one (I'm a bit sorry if this offends the senior experts and big shots). But due to various factors, I can't implement these functions in a short period of time. Before releasing this version, I was stubbornly trying to implement the file upload function because I think file upload is a key progress node for a series of subsequent functions. However, after several consecutive days of making no progress, I had to give up. Currently, the progress is stuck at the file upload stage. My idea is to use RAG, but I can't even achieve the local document segmentation stage. The pdfjs library can't be called, and everything that follows is in vain. I will release the latest stage of this project to another branch, but I estimate that there won't be any progress for a long time. I've compromised. I think the current functions are sufficient for my use. If I can't integrate everything into one plugin, I'll just use several plugins instead.  
 - During the development process, I found that relevant plugins had actually been developed by others long ago, such as '[zotero-paper-agent](https://github.com/windfollowingheart/zotero-paper-agent)'. I would like to pay my respects to the experts. The concept of this project is quite unique. It adopts the URL solution, so there is limited room for me to draw on its code.  

# Last Edit Date：2025/4/25 CST 00:18

import React from 'react'
import { Card, CardHeader } from '../components/ui'

const SCOPE_TEXT = "CREA2 project builds on the results of its predecessor, CREA (2017-19). It aims at introducing Artificial Intelligence (AI) driven tools to assist natural and legal persons in resolving their disputes through the application of innovative game-theoretical (GT) algorithms. It will help users to locate information of interest and follow them step-by-step through dispute resolution procedures.\n\nIn parallel, this novel approach towards civil dispute resolution will tackle the existing disparities among the national legal systems of the several EU Member States (MS) through establishing a European Common Ground of Available Rights (ECGAR), i.e., putting aside all the mandatory rules of each MS and operating on the remaining \u2018rights available\u2019.\n\nThe main objective is to facilitate users\u2019 access to Online Dispute Resolution (ODR) mechanisms and, consequently, to avoid denial of justice or structural difficulties in accessing justice. Hence CREA2 will offer 3 novelties:\n- Linking the ECGAR to the developed GT algorithmic model of dispute resolution to provide precise standards for integrating law & AI (WP2);\n- Applying AI-driven tools based on machine learning for implementing an innovative smart conversational user interface, guiding the practitioner, the legal and the regular users in setting and resolving the dispute resolution process; (WP3);\n- Implementation of Smart-contract Blockchain Technology based on DApp Design methodology for the certified agreement between the parties (WP4);\n\nMoreover, a videoconferencing function, allowing the mediator to speak with both parties on the software (WP3), is added.\n\nCREA2 will improve the existing CREA platform. The software will be distributed as an open-source project. The project will involve \u2013 as main target groups \u2013 a wide range of EU stakeholders, including over 150 lawyers, 30 notaries, 50 mediators, 5 consumer associations, 100 academics, 300 students, 5 legal tech companies, 5 policymakers."

export default function Scope() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Project scope" subtitle="About the CREA2 European project and its objectives." />
        <div className="p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {SCOPE_TEXT}
        </div>
      </Card>
    </div>
  )
}

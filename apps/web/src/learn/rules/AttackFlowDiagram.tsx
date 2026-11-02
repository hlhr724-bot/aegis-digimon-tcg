import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getRulesGuideLabels } from "@/learn/rules/getRulesGuideLabels";

export function AttackFlowDiagram() {
  const { locale } = useTranslation();
  const flow = getRulesGuideLabels(locale).attackFlow;
  return (
    <div className="rules-flow" lang={locale === "pt-BR" ? "pt-BR" : "en"}>
      {[flow.declare, flow.triggers, flow.defend, flow.confirm].map((step) => (
        <div className="rules-flow__step" key={step}>
          <span className="rules-flow__node">{step}</span>
          <span className="rules-flow__arrow" aria-hidden="true">
            <Icons.ChevronDown size={18} />
          </span>
        </div>
      ))}
      <div className="rules-flow__branches">
        <span className="rules-flow__node">{flow.battle}</span>
        <span className="rules-flow__node">{flow.security}</span>
        <span className="rules-flow__node rules-flow__node--goal">
          <Icons.Trophy size={16} />
          {flow.win}
        </span>
      </div>
      <p className="rules-example">{flow.caution}</p>
    </div>
  );
}
